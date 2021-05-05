import {
	existsSync as exists,
	statSync as stats,
	createReadStream as read_stream,
} from "fs";
import Server, {
	SHARED_COMPRESSOR
} from "uWebSockets.js";
import mime from "mime";
import {
	is
} from "crux";
import {
	Type, Emitter
} from "zed";

const COLON = ':';
const EQUAL = '=';
const PIPE = '|';
const SLASH = '/';
const AND = '&';
const TYPED_ARRAY = Uint8Array.constructor.__proto__; // <-- TypedArray is tricky to get.
const DO_NOTHING = x => x;
const CONCAT = (a, b) => {
	// can't handle directories with dots in them... TODO: fix this...
	return `${a}/${b}`.replace(/\/\.\//g, '/').replace(/\/[\w-]+\/\.\.\//g, '/');
}
const BUFF = buffer =>
				buffer.buffer.slice(
					buffer.byteOffset,
					buffer.byteOffset + buffer.byteLength
				);
const QUERY = query =>
	query ? Object.fromEntries(new Map(
		query.trim()
			.split(AND)
			.map(x => x.trim())
			.filter(DO_NOTHING) // Surprisingly, this does smthg; it removes empty strings!
			.map(pair =>
				pair.split(EQUAL)
					.map(x => x.trim())
					.filter(DO_NOTHING)
			)
	)) : {};

class Binary extends Type {
	static defines(instance) {
		return instance instanceof ArrayBuffer ||
				// instance instanceof DataView || // <-- Would this be consistent?
					instance.constructor.__proto__ === TYPED_ARRAY;
	}
}

export const YIELD = Symbol('request yield');
export const HANDLED = Symbol('request handled')
export const STATUS = http.STATUS_CODES.map(
				([code, desc]) => [
					desc
						.replace(/\s+/g, '')
						.replace(/('|-)/g, ''),
					code
				]);
export const CODES = Object.fromEntries(new Map([
	'Normal',
	'GoingAway',
	'ProtocolError',
	'UnsupportedData',
	'None',
	'NoStatusReceived',
	'AbnormalClosure',
	'InvalidFrame',
	'PolicyViolation',
	'MessageTooBig',
	'MissingExtension',
	'InternalError',
	'ServiceRestart',
	'TryAgainLater',
	'BadGateway',
	'TLSHandshake'
].map((x, i) => [x, i + 1000])));

export class Request extends Type({
	method: String,
	uri: String,
	route: String,
}) {
	#request; // <-- uWS
	#response; // <-- Surf
	#middleware = [];

	get ip() {
		return this.#response.ip;
	}

	get headers() {
		const headers = [];
		this.#request.forEach((key, value) => headers.push([key, value]));
		return headers;
	}

	get params() {
		const req = this.#request;
		return this.route.split(SLASH)
				.filter(dir => dir.startsWith(COLON))
				.map(param => param.substr(1))
				.map((param, index) => [param, req.getParameter(index)]);
	}

	get query() {
		return QUERY(this.#request.getQuery());
	}

	get host() {
		return this.header('host');
	}
 
	get filename() {
		return this.uri.split(SLASH).pop();
	}

	get type() {
		return this.header('content-type') || 'text/plain'; // <-- or text/html?
	}

	constructor(route, req, res, middleware) {
		super({
			route: route,
			uri: req.getUrl(),
			method: req.getMethod().toUpperCase(),
		});
		res.init(this);
		
		this.#request = req; // uWS
		this.#response = res; // Surf
		this.#middleware = middleware;
	}

	header(key) {
		return this.#request.getHeader(key);
	}

	body(ondone, onerror = DO_NOTHING) {
		if (!is.function(ondone))
			return new Promise((resolve, reject) => this.body(resolve, reject));

		const res = this.#response;

		let buffer;
		res.ondata((payload, isdone) => {
			const chunk = Buffer.from(payload);
			buffer = Buffer.concat(buffer ? [buffer, chunk] : [chunk]);
			if (isdone) {
				const middleware = this.#middleware;
				for (let [condition, hook] in middleware) {
					if (condition(this)) {
						let output = hook(buffer, this, res);
						if (!is.undefined(output) && output !== YIELD) {
							buffer = output;
							break;
						}
					}
					
				}
				buffer === HANDLED ?
					onerror(
						`${
							this.#request.status
						} ${
							http.STATUS_CODES[this.#request.status]
						}`) :
						ondone(buffer);
			}
		});


	}
	
	bad_request(body = `${STATUS.BadRequest} BAD REQUEST`) {
		this.#response.send(body, STATUS.BadRequest);
		return HANDLED;
	}

	bad_method(
		body = `${STATUS.MethodNotAllowed} METHOD '${this.method}' NOT ALLOWED/SUPPORTED`
	) {
		return this.#response.send(body, STATUS.MethodNotAllowed);
	}

	yield(yield = true) {
		return this.#request.setYield(yield) && YIELD;
	}
}

export class Response extends Type {
	#request; // <-- Surf
	#response; // <-- uWS
	#middleware = [];
	
	#id = [];
	#title = [];
	#status = '200';
	#headers = [];
	#timestamp = 0;

	#aborted = false;
	#onabort = DO_NOTHING;
	#sends = 0;

	get status() {
		return this.#status;
	}

	get ip() {
		// TODO: Improve this!
		return String(this.#response.getRemoteAddressAsText());
	}

	get id() {
		return this.#id.join(SLASH);
	}

	set id(id) {
		return this.#id.push(id) && this.#id;
	}

	get title() {
		return this.#title.join(PIPE);
	}

	set title(title) {
		return this.#title.unshift(title) && this.#title;
	}

	get headers() {
		return this.#headers;
	}

	set headers(more_headers) {
		return this.#headers.concat(
			more_headers instanceof Array ?
				more_headers : Object.entries(more_headers));
	}

	// Get the time since this request was created (in ms)
	get time() {
		return Date.now() - this.#timestamp;
	}

	get aborted() {
		return this.#aborted;
	}

	constructor(res, middleware) {
		super();
		this.#response = res; // uWS...
		this.#middleware = middleware;
		this.#timestamp = Date.now();

		res.onAborted(() => {
			this.#aborted = true;
			this.#onabort();
		});
	}

	init(req) {
		this.#request = req; // Surf...
		return this;
	}

	header(key, value) {
		this.#headers.push([key, value]);
		return this;
	}

	send_buffer(buffer, size, success, rs) {
		let [ok, done] = this.#response.tryEnd(buffer, size);
		if (done) {
			success ?? success();
			rs ?? rs.destroy();
		}
		return ok;
	}
	
	async send(body = '', status = STATUS.OK, headers = []) {
		if (this.#aborted)
			return;
		
		const res = this.#response;
		if (++this.#sends > 3) {
			res.writeStatus(this.#status = STATUS.LoopDetected)
				.end(`${
					STATUS.LoopDetected
				} LOOP DETECTED (more than 3 attempts to send on the same request)`);
			return HANDLED;
		}
		this.#status = status;

		const req = this.#request;
		const middleware = this.#middleware;
		
		for (let [condition, hook] in middleware) {
			if (condition(this)) {
				let output = await hook(body, req, this);
				if (!is.undefined(output) && output !== YIELD) {
					body = output;
					break;
				}
			}
		}

		if (body !== HANDLED) {
			this.#aborted = true; // No further sending will be allowed:
			this.headers = headers; // Append new headers
			res.cork(async () => {
				res.writeStatus(status);
				this.headers.forEach(([key, value]) => res.writeHeader(key, value));
				res.end(body);
			});
		}

		return HANDLED;
	}

	redirect(Location = '/', status = STATUS.Found) {
		return ![
			STATUS.Found,
			STATUS.MovedPermanently,
			STATUS.TemporaryRedirect,
			STATUS.PermanentRedirect
		].includes(status) ?
			this.error(`REDIRECT ERROR: INVALID STATUS '${status}'`) :
				this.send(
					`${status} RESOURCE ${http.STATUS_CODES[status].toUpperCase()} => ${Location}`,
					status,
					{Location}
				);
	}

	// Used for methods that create a new resource (but not POST... just 200 is fine)
	created(Location, body = `${STATUS.Created} RESOURCE CREATED => ${Location}`) {
		return this.send(body, STATUS.Created, {Location});
	}

	// Ouft!
	not_found(body = `${STATUS.NotFound} RESOURCE NOT FOUND`) {
		return this.send(body, STATUS.NotFound);
	}

	// Call this to tell the user an internal server error has occurred.
	// NOTE: this is when the error is OUR fault.
	error(body = `${STATUS.InternalServerError} INTERNAL SERVER ERROR`) {
		return this.send(body, STATUS.InternalServerError);
	}

	unauthorized(realm = "Access to privileged data.", ...types) {
		if (!types.length)
			types.push('Basic');
		const status = STATUS.Unauthorized;
		return this.send(
			`${status} ${http.STATUS_CODES[status].toUpperCase()} => "${realm}"`,
			status,
			types.map(
				type =>
					["WWW-Authenticate", `${type} realm="${realm}", charset="UTF-8"`]
			)
		);
	}

	stream(
		stream, // Anything that is a JavaScript stream... readstream, etc... they all have the same API, right?
		size, // What about live streams? Can this be omitted?
		success = DO_NOTHING,
		onerror = DO_NOTHING,
		onabort = DO_NOTHING
	) {
		const res = this.#response;
		let buffer;
		let l_offset;

		stream.on('data', chunk => {
			if (!this.send_buffer(buffer = BUFF(chunk), size, success, stream)) {
				readstream.pause();
				l_offset = res.getWriteOffset();
			}
		}).on('error', e => {
			this.close(); // ?
			onerror(e);
		});
		this.onabort(() => {
			stream.destroy();
			onabort();
		});
		this.onwrite(offset => {
			let ok = this.send_buffer(buffer.slice(offset - l_offset), size, success, stream);
			if (ok)
				stream.resume();
			return ok;
		});

		return HANDLED;
	}

	file_head(filename) {
		let size = stats(filename).size;
		let type = mime.getType(filename);

		this.#response.writeStatus(OK)
			.writeHeader("Content-Type", type)
			.writeHeader("Content-Length", size);
		
		return size;
	}

	file(filename, success, onerror, onabort) {
		const size = this.file_head(filename);
		let readstream = read_stream(filename);
		return exists(filename) ?
			this.stream(readstream, size, success, onerror, onabort) :
				this.not_found();
	}

	// TODO: finish and test:
	live_stream(mime_type, stream, oncomplete, onerror, onabort) {
		this.#response.writeStatus(OK)
			.writeHeader("Content-Type", mime_type);
		// How do we end the stream? res.close/end/tryEnd()?
		// TODO: look more into how streaming endpoints work.
		return this.stream(stream, Number.POSITIVE_INFINITY, oncomplete, onerror, onabort);
	}

	timeout(body = `${STATUS.RequestTimeout} REQUEST TIMEOUT`) {
		return this.send(body, STATUS.RequestTimeout);
	}

	teapot(body = `${STATUS.ImaTeapot} I'M A TEAPOT`) {
		return this.send(body, STATUS.ImaTeapot);
	}

	ondata(callback) {
		this.#response.onData(callback);
		return this;
	}

	onwrite(callback) {
		this.#response.onWritable(callback);
		return this;
	}

	onabort(callback) {
		this.#onabort = callback;
		return this;
	}

	close() {
		this.#response.close();
		return HANDLED;
	}

	yield(yield = true) {
		return this.#request.setYield(yield) && YIELD;
	}
}

export class Socket extends Type {
	#socket;
	#middleware;

	get ip() {
		return String(this.#response.getRemoteAddressAsText());
	}

	constructor(socket, middleware) {
		super();
		this.#socket = socket;
		this.#middleware = middleware;
	}

	cork(callback) {
		this.#socket.cork(callback);
	}

	pipe(msg) {
		const is_binary = msg instanceof Binary;
		return [
			is_binary ?
				this.#middleware.write(msg) :
					this.#middleware.stringify(msg),
			is_binary
		];
	}

	send(msg, compress = false) {
		this.#socket.send(...this.pipe(msg), compress);
		return this;
	}

	publish(topic, msg, compress = false) {
		this.#socket.publish(topic, ...this.pipe(msg), compress);
		return this;
	}

	subscribe(topic) {
		this.#socket.subscribe(topic);
		return this;
	}

	unsubscribe(topic) {
		this.#socket.unsubscribe(topic);
		return this;
	}

	end(code, msg) {
		this.#socket.end(code, ...this.pipe(msg));
	}

	close() {
		this.#socket.close();
	}
}

export class Listener extends Type(Emitter, {
	compression: SHARED_COMPRESSOR,
	maxPayloadLength: 16 * 1024,
	maxBackpressure: 1024,
	idleTimeout: 10,

	open: Function,
	message: Function,
	close: Function,
	drain: Function
}) {
	constructor(hooks, middleware) {
		if (is.function(hooks))
			hooks = {
				message: hooks
			};
		super({
			open: socket => {
				console.log('SOCKET OPENED');
				hooks.open && hooks.open(new Socket(socket, middleware));
			},
			message: (socket, message, is_binary) => {
				console.log('SOCKET MESSAGE RECEIVED');
				socket = new Socket(socket, middleware);
				const rtrn = hooks.message(
					is_binary ?
						middleware.read(message) :
							middleware.parse(message, socket),
					socket
				);
				if (rtrn && rtrn !== HANDLED && rtrn !== YIELD)
					socket.send(rtrn);
			},
			close: (socket, code, message) => {
				console.log('SOCKET CLOSED');
				hooks.close && hooks.close(
					code,
					message,
					socket
				);
			},
			drain: socket => {
				console.log('SOCKET DRAIN, BABY...');
				hooks.drain && hooks.drain(new Socket(socket, middleware));
			},
		});
	}
}

export class Endpoint extends Type({
	get: Function,
	head: Function,
	post: Function,
	put: Function,
	options: Function,
	any: Function,
}) {
	constructor(hooks) {
		if (is.function(hooks))
			hooks = {
				get: hooks
			};
		
		if (!hooks.any)
			hooks.any = req => req.bad_method();
		
		super(hooks);
	}
}

export class Router extends Emitter {
	// TODO: middleware?
	constructor(name, routes) {
		if (!routes)
			routes = name,
			name = this.constructor.name;
		
		if (is.function(routes))
			routes = {
				"/": routes
			};
		this.static(
			routes.map(
				([
					pattern,
					endpoint
				]) =>
					[
						pattern,
						endpoint.constructor === Object ||
							is.function(endpoint) ?
								new Endpoint(endpoint) : endpoint
					]
			)
		);
	}
}

export class Surf extends Emitter {
	#app;
	#router;
	#middleware = [
		req => {
			console.log(`[${req.method} ${req.type}]`);
			console.log(`"${req.uri}" => ${req.route}`);
			console.log(req.headers.map(([key, value]) => `  "${key}" "${value}"`));
			console.log('----------------------------------------');
		}
	];

	#bodyware = {
		parse: [
			// JSON DATA REQUEST
			[
				req => req.type === 'application/json',
				(body, req) => {
					try {
						return JSON.parse(body);
					} catch(e) {
						return req.bad_request(`${STATUS.BadRequest} MALFORMED JSON`);
					}
				}
			],
			// MULTIPART FORM DATA REQUEST
			[
				req => req.type.startsWith('multipart/form-data'),
				(body, req) => this.#app.getParts(body, req.type)
			],
			// FORM DATA REQUEST
			[
				req => req.type === 'application/x-www-form-urlencoded',
				body => QUERY(new String(body || ''))
			],
			// PLAIN TEXT (DEFAULT)
			[
				req => req.type === 'text/plain',
				body => String(body),
			],
			// TODO: handle binary by default
		],
		stringify: [
			// JSON DATA RESPONSE
			[
				req => req.type === 'application/json',
				body => JSON.stringify(body) ?? ''
			],
			// PLAIN TEXT RESPONSE (DEFAULT)
			[
				req => req.type === 'text/plain',
				body => String(body) // <-- We should get [object Object] for non-handled types.
			]
			// TODO: handle binary by default
		]
	}

	#socketware = {
		parse(msg, socket) {
			return String(msg)
		},
		stringify(msg, socket) {
			return String(msg);
		},
		read(binary, socket) {
			return binary;
		},
		write(binary, socket) {
			return binary;
		}
	}

	constructor(router) {
		super();
		this.router =
			router instanceof Router ?
				router : new Router(router);
	}

	middleware(...intercepts) {
		this.#middleware.push(...intercepts);
		return this;
	}

	bodyware(...intercepts) {
		intercepts.forEach(({parse, stringify}) => {
			parse && this.#bodyware.parse.unshift(parse);
			stringify && this.#bodyware.stringify.unshift(stringify);
		});
		return this;
	}

	socketware(intercept) {
		this.#socketware.assign(intercept);
		return this;
	}

	parse(router, mount = '/') {
		const app = this.#app;
		router.forEach(([pattern, endpoint]) => {
			const mountpoint = CONCAT(mount, pattern);
			if (endpoint instanceof Router)
				return this.parse(endpoint, mountpoint); // This is mostly OK!
			endpoint.forEach(([method, hook]) => {
				if (method === "listen")
					app.ws(mountpoint, Listener(hook, this.#socketware));
				else
					app[mountpoint](
						pattern,
						async (res, req) => {
							let response =
								new Response(
									res,
									this.#bodyware.stringify
								);
							let request =
								new Request(
									pattern,
									req,
									response,
									this.#bodyware.parse
								);
							
							for (let middle in this.#middleware)
								if (middle(request, response) === HANDLED)
									return;
							
							const output = await hook(request, response);
							if (output && output !== HANDLED) {
								if (output === YIELD)
									response.yield();
								else
									response.send(output);
							}
						}
					)
			})
		});
	}

	listen(
		port = process.env.PORT || 9000,
		success = DO_NOTHING,
		error = DO_NOTHING
	) {
		this.#app = (env => {
			const key_file_name = env.KEY_FILE;
			const cert_file_name = env.CERT_FILE;
			const passphrase = env.PASSPHRASE;

			return key_file_name && cert_file_name ?
				Server.SSLApp({
					key_file_name,
					cert_file_name,
					passphrase
				}) : Server.App({passphrase});
		})(process.env);

		this.parse(this.#router);
		app.listen(port, socket => {
			if (socket)
				success(socket);
			else
				error(socket);
		});
		return this;
	}
}

export default function surf(router) {
	return new Surf(router instanceof Router ? router : new Router(router));
};