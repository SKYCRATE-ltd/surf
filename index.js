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
	Emitter
} from "zed";

const COLON = ':';
const EQUAL = '=';
const PIPE = '|';
const SLASH = '/';
const AND = '&';
const DO_NOTHING = x => x;
const BUFF = buffer =>
				buffer.buffer.slice(
					buffer.byteOffset,
					buffer.byteOffset + buffer.byteLength
				);
const QUERY = query =>
	Object.fromEntries(new Map(
		query
			.split(AND)
			.map(pair => pair.split(EQUAL))
	));

export const YIELD = Symbol('yield');
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
	query: Object,
}) {
	#request;
	#response;

	get headers() {
		const headers = {}; // REMOVE THIS (PROBABLY)
		this.#request.forEach((key, value) => headers[key] = value);
		return headers;
	}

	get params() {
		const req = this.#request;
		return this.route.split(SLASH)
				.filter(dir => dir.startsWith(COLON))
				.map(param => param.substr(1))
				.map((param, index) => [param, req.getParameter(index)]);
	}

	get filename() {
		return this.uri.split(SLASH).pop();
	}

	constructor(route, res, req, query = req.getQuery()) {
		this.#request = req;
		this.#response = res;
		this.route = route;
		this.uri = req.getUrl();
		this.method = req.getMethod().toUpperCase();
		this.query = query ? QUERY(query) : {};
	}

	header(key) {
		return this.#request.getHeader(key);
	}

	stream(ondata = DO_NOTHING, onabort = DO_NOTHING) {
		const res = this.#response;
		res.ondata((payload, isdone) => ondata(Buffer.from(payload), isdone));
		res.onabort(onabort);
	}

	data(handler, success, onerror = DO_NOTHING, onabort) {
		let buffer;
		this.stream((chunk, isdone) => {
			buffer = buffer ? Buffer.concat([buffer, chunk]) : Buffer.concat([chunk]);
			if (isdone) {
				let data;
				try {
					data = handler(buffer);
				} catch(e) {
					onerror(buffer);
					return res.close();
				}
				success(data);
			}
		}, onabort);
	}

	text(success, onerror, onabort) {
		return this.data(String, success, onerror, onabort);
	}

	json(success, onerror, onabort) {
		return this.data(JSON.parse, success, onerror, onabort);
	}

	form(success, onerror, onabort) {
		return this.data(buffer => QUERY(String(buffer)), success, onerror, onabort);
	}

	body(success, onerror, onabort) {
		const type = this.header('content-type');
		// TODO: some middleware to read content-type and, if handled, parse our type...
		// TODO: uploading a file... might need to read some stuff...
		if (type === 'application/x-www-form-urlencoded')
			return this.form(success, onerror, onabort);
		if (type === 'application/json')
			return this.json(success, onerror, onabort);
		return this.text(success, onerror, onabort);
	}

	yield(yield = true) {
		return this.#request.setYield(yield);
	}
}

export class Response extends Type {
	#request;
	#response;
	#aborted = false;
	#onabort = DO_NOTHING;
	
	#id = [];
	#title = [];
	#headers = [];
	#timestamp = 0;

	// Get the time since this request was created (in ms)
	get time() {
		return Date.now() - this.#timestamp;
	}

	// Sometimes, the user bails on a request.
	get aborted() {
		return this.#aborted;
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

	header(key, value) {
		this.#headers.push([key, value]);
		return this;
	}

	constructor(res, req, now = Date.now()) {
		super();
		this.#request = req;
		this.#response = res;
		this.#timestamp = now;

		req.onAborted(() => {
			this.#aborted = true;
			this.#onabort();
		});
	}

	yield(yield = true) {
		this.#request.setYield(yield);
	}

	redirect(Location = '/', status = STATUS.Found) {
		const ALLOWED = [
			STATUS.Found,
			STATUS.MovedPermanently,
			STATUS.TemporaryRedirect,
			STATUS.PermanentRedirect
		];
		this.send(null, status, {Location});
	}

	created_resource(Location, body = null) {
		this.send(body, STATUS.Created, {Location})
	}

	not_found(body) {
		this.send(body, STATUS.NotFound);
	}

	bad_request(body) {
		this.send(body, STATUS.BadRequest);
	}

	bad_method(body) {
		this.send(body, STATUS.MethodNotAllowed);
	}

	unauthorized(realm = "Access to privileged data.", ...types) {
		if (!types.length)
			types.push('Basic');
		this.send(
			null,
			STATUS.Unauthorized,
			types.map(
				type =>
					["WWW-Authenticate", `${type} realm="${realm}", charset="UTF-8"`]
			)
		);
	}

	timeout(body) {
		this.send(body, STATUS.RequestTimeout);
	}

	teapot(body) {
		this.send(body, STATUS.ImaTeapot);
	}

	close() {
		this.#response.close();
	}

	ondata(callback) {
		this.#response.onData(callback); // <-- TODO: wrap callback for event?
		return this;
	}

	onwrite(callback) {
		this.#response.onWritable(callback); // <-- TODO: wrap callback for event?
		return this;
	}

	onabort(callback) {
		this.#onabort = callback;
		return this;
	}
	
	send(body, status = STATUS.OK, headers = []) {
		if (this.#aborted)
			return;
		const res = this.#response;
		this.headers = headers; // Append new headers
		headers = this.headers;

		// TODO: add middleware
		res.cork(() => {
			res.writeStatus(status);
			headers.forEach(([key, value]) => res.writeHeader(key, value));
			body ? res.end(body) : res.end();
		});
	}

	send_buffer(buffer, size, success, rs) {
		let [ok, done] = this.#response.tryEnd(buffer, size);
		if (done) {
			success ?? success();
			rs ?? rs.destroy();
		}
		return ok;
	}

	stream(
		mime_type,
		readstream, // TODO: other kinds of streams?
		size,
		success = DO_NOTHING,
		onerror = DO_NOTHING,
		onabort = DO_NOTHING
	) {
		const res = this.#response;
		let buffer;
		let l_offset;

		res.writeStatus(OK)
			.writeHeader("Content-Type", mime_type);

		readstream.on('data', chunk => {
			if (!this.send_buffer(buffer = BUFF(chunk), size, success, readstream)) {
				readstream.pause();
				l_offset = res.getWriteOffset();
			}
		}).on('error', e => {
			this.close(); // ?
			onerror(e);
		});
		// CHANGE THIS
		this.onabort(() => {
			readstream.destroy();
			onabort();
		});
		this.onwrite(offset => {
			let ok = this.send_buffer(buffer.slice(offset - l_offset), size, success, readstream);
			if (ok)
				readstream.resume();
			return ok;
		});
	}

	file_stream(filename, success, error) {
		let size = stats(filename).size;
		let type = mime.getType(filename);
		let readstream = read_stream(filename);
		exists(filename) ?
			this.stream(type, readstream, size, success, error) :
				this.not_found();
	}
}

export class Listener extends Type(Emitter, {
	compression: SHARED_COMPRESSOR,
	payload_size: 16 * 1024 * 1024,
	bottleneck_size: 1024,
	timeout: 10,
}) {
	constructor(hooks, handler = String) {
		if (is.function(hooks))
			hooks = {
				message: hooks
			};

		super();
		this.static(hooks.map(
			([event, hook]) =>
				[
					event,
					(socket, message, is_binary) => {
						const message = is_binary ? message : handler(message);
						if (message === undefined || message === null)
							socket.end('Data sent is not valid.');
						else
							hook.call(
								socket,
								message,
								socket
							);
					}
				]
		));
	}
}

export class JSONListener extends Listener {
	constructor(hooks) {
		super(hooks, buffer => {
			try {
				return JSON.parse(buffer);
			} catch(e) {
				return undefined
			}
		});
	}
}

export class Endpoint extends Emitter {
	// TODO: Endpoint API?
	constructor(hooks) {
		if (is.function(hooks))
			hooks = {
				get: hooks
			};

		super(); // dp anything?
		// Anything else we actually need to do?
		// What we might do is override defaults....
		// that's actually not a terrible idea...
		// what was it about options?
		this.static({
			...hooks,

		});
	}
	// ANY REQUEST METHOD. 
	any() {
		// 
	}
	// RETRIEVE HEADERS FOR GET REQUEST
	head() {
		// For file size and other tings...
	}
	// RETRIEVE RESOURCE
	get() {

	}
	// CREATE RESOURCE
	post() {

	}
	// CREATE OR UPDATE RESOURCE
	put() {

	}

	options() {
		// 
	}
}

export class Router extends Emitter {
	constructor(name, routes) {
		if (!routes)
			routes = name,
			name = this.constructor.name;
		this.static(routes.map(([pattern, endpoint]) => {
			// If it's an unsuspecting object literal, make an Endpoint,
			// If it's already an Endpoint, leave it as is.
			// If it's a router... we have to do magics...
		}))
	}
}

export class Surf extends Emitter {
	#app;
	#router;
	#in = []; // Our in-bound middleware
	#out = []; // our out-bound middleware

	constructor(router) {
		super();
		this.router =
			router instanceof Router ?
				router : new Router(router);
	}

	init(
		passphrase = process.env.PASSPHRASE,
		key_file_name = process.env.KEY_FILE,
		cert_file_name = process.env.CERT_FILE
	) {
		this.#app = key_file_name && cert_file_name ?
			Server.SSLApp({
				key_file_name,
				cert_file_name
			}) : Server.App({passphrase});
		return this;
	}

	middleware(...intercepts) {

		return this;
	}

	listen(
		port = process.env.PORT || 9000,
		success = DO_NOTHING,
		error = DO_NOTHING
	) {
		const app = this.#app;
		this.init();
		this.#router.forEach(([pattern, endpoint]) =>
			endpoint.forEach(([method, hook]) =>
				app[method](
					pattern,
					method == "ws" ? hook :
						async (res, req) => {
							// OK, this is good.
						}
				)
			)
		);
		return this;
	}
}

export default function surf(router) {
	return new Surf(router instanceof Router ? router : new Router(router));
};