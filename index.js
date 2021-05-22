import {
	existsSync as exists,
	statSync as stats,
	createReadStream as read_stream,
} from "fs";

import Server from "uWebSockets.js";
import mime from "mime";

import { uuid } from "computer";
import {
	is
} from "crux";
import {
	Type,
	Emitter,
	UInt,
	Any,
	Hook
} from "zed";

import {
	CLOCK,
	SEMI,
	COLON,
	COMMA,
	EQUAL,
	PIPE,
	SLASH,
	AND,
	NEWLINE,

	STATUS,

	OK,
	YIELD,
	HANDLED,
	DO_NOTHING,
	BAD_REQUEST,
	UNAUTHORIZED,
	BAD_METHOD
} from "./constants.js";
import {STATUS_CODES} from "http";
import BODYWARE_JSON from "./bodyware/json.js";
import SOCKETWARE from "./socketware/default.js";

const CONCAT = (a, b) => {
	if (a === SLASH)
		a = '';
	if (b === SLASH)
		b = '';
	return `${a}/${b}`
		.replace(/\/\//g, SLASH)
		.replace(/\/\.\//g, SLASH)
		.replace(/\/[\w-]+\/\.\.\//g, SLASH);
}
const DECODE = message => new TextDecoder("utf-8").decode(message);
const BUFF = buffer =>
				buffer.buffer.slice(
					buffer.byteOffset,
					buffer.byteOffset + buffer.byteLength
				);
const QUERY = (query, delim = AND) =>
	query ? Object.fromEntries(new Map(
		query.trim()
			.split(delim)
			.map(x => x.trim())
			.filter(DO_NOTHING) // Surprisingly, this does smthg; it removes empty strings!
			.map(pair =>
				pair.split(EQUAL)
					.map(x => decodeURIComponent(x.trim().replace(/\+/g, '%20')))
					.filter(DO_NOTHING)
			)
	)) : {};

class Binary extends Type {
	static validate() {
		return false;
	}
	static defines(instance) {
		return instance.constructor === ArrayBuffer ||
					instance.constructor.__proto__ === Uint8Array.constructor.__proto__;
	}
}

class Entry extends Type({
	id: String,
	createdAt: Date,
	updatedAt: Date,
	expiresAt: Date,
	data: Any,
}) {
	constructor(values) {
		super(values);
		if (!this.expiresAt)
			this.reset();
	}

	update(data) {
		this.data = this.data?.assign(data) ?? data;
		return this.reset();
	}

	reset(duration = 60000 * 10/* 10 mins from now is the default, baby */) {
		this.expiresAt = new Date(Date.now() + duration);
		return this;
	}

	expired(date = new Date()) {
		return this.expiresAt.getTime() < date.getTime();
	}
}

class Collection extends Map {
	#hooks;

	constructor(hooks) {
		super();
		this.#hooks = hooks;

		hooks.init?.(this);

		setInterval(() => {
			this.forEach((item, id) => {
				if (item.expired())
					this.delete(id);
			});
		}, 30000); // Every thirty seconds
	}

	load(map) {
		map.forEach(([id, item]) => {
			const session = this.set(id, new Entry(item));
			console.log(  '------------------------------------------------------------ ');
			console.log(`\r 💾 LOADING SESSION                                          `);
			console.log(  '------------------------------------------------------------ ');
			console.log(  `  ID: ${session.id}`);
			console.log(  `  CREATED: ${session.createdAt.toLocaleTimeString()}`);
			console.log(  `  EXPIRES: ${session.expiresAt.toLocaleTimeString()}`);
		});
		return this;
	}

	create(id = uuid()) {
		if (this.has(id))
			return this.create();
		
		const createdAt = new Date();
		const session = new Entry({
			id,
			createdAt,
			updatedAt: createdAt
		});

		console.log(`\r 📕 CREATING NEW SESSION                                     `);
		console.log(  '------------------------------------------------------------ ');
		console.log(  `  ID: ${id}`);
		console.log(  `  CREATED: ${createdAt.toLocaleTimeString()}`);
		console.log(  `  EXPIRES: ${session.expiresAt.toLocaleTimeString()}`);
		console.log(  '------------------------------------------------------------ ');

		return this.set(id, this.#hooks.create?.(session) || session);
	}

	get(id) {
		const session = super.get(id);
		if (session) {
			session.reset();
			console.log(`\r 📖 RETRIEVING SESSION                                        `);
			console.log(  '------------------------------------------------------------ ');
			console.log(  `  ID: ${id}`);
			console.log(  `  CREATED: ${session.createdAt.toLocaleTimeString() || 'N/A'}`);
			console.log(  `  EXPIRES: ${session.expiresAt.toLocaleTimeString() || 'N/A'}`);
			console.log(  '------------------------------------------------------------ ');
			
			return this.#hooks.get?.(session) || session;
		}
		return session;
	}

	set(id, session) {
		super.set(id, session);
		return session;
	}

	update(id, data) {
		const session = this.get(id);

		if (session) {
			session.update(data);

			console.log(`\r ✍  UPDATING SESSION                                          `);
			console.log(  '------------------------------------------------------------ ');
			console.log(  `  ID: ${id}`);
			console.log(  `  CREATED: ${session.createdAt.toLocaleTimeString() || 'N/A'}`);
			console.log(  `  EXPIRES: ${session.expiresAt.toLocaleTimeString() || 'N/A'}`);
			console.log(  '------------------------------------------------------------ ');
			
			this.#hooks.update?.(session);
		}
		return this;
	}

	delete(id) {
		console.log(`\r 💥 DELETING SESSION                                         `);
		console.log(  '------------------------------------------------------------ ');
		console.log(  `  ID: ${id}`);
		console.log(  '------------------------------------------------------------ ');
		return super.delete(this.#hooks.delete?.(id) || id);
	}
}

export class Request extends Type({
	route: String,
	uri: String,
	method: String,
	session: Entry,
	host: Hook(
		req => req.header('host') || 'localhost'
	),
	params: Hook(
		req => req.route.split(SLASH)
				.filter(dir => dir.startsWith(COLON))
				.map(param => param.substr(1))
	),
	filename: Hook(
		req => req.uri.split(SLASH).pop()
	),
	cookies: Hook(
		req => QUERY(req.header('cookie'), SEMI)
	),
	accepted: Hook(
		req =>
			req.header('accept')
				?.split(COMMA)
				.map(mime => mime.split(SEMI)[0])
	),
	type: Hook(
		req =>
			req.header('content-type') || 'text/plain'
	),
}) {
	#headers;
	#request; // <-- uWS
	#response; // <-- Surf
	#middleware = [];

	get ip() {
		return this.#response.ip;
	}

	get args() {
		const req = this.#request;
		return Object.fromEntries(new Map(
			this.params.map((param, index) => [param, req.getParameter(index)])
		));
	}

	get query() {
		return QUERY(this.#request.getQuery());
	}

	get headers() {
		if (!this.#headers) {
			this.#headers = [];
			this.#request.forEach((key, value) => this.#headers.push([key, value]));
		}
		return this.#headers;
	}

	constructor(route, req, res, middleware, sessions) {
		super({
			route: route,
			uri: req.getUrl(),
			method: req.getMethod().toUpperCase()
		});
		res.init(this);
		
		this.#request = req; // uWS
		this.#response = res; // Surf
		this.#middleware = middleware;

		if (sessions && this.accepted.includes('text/html')) {
			this.session = sessions.get(this.cookies['session-id']) || sessions.create();
			this.cookies['session-id'] = this.session.id;
		}
	}

	header(key) {
		return this.headers.find(([k]) => k === key)?.[1];
	}

	body(ondone, onerror) {
		if (!is.function(ondone))
			return new Promise((resolve, reject) => this.body(resolve, reject));

		const res = this.#response;

		let buffer;
		res.ondata((payload, isdone) => {
			const chunk = Buffer.from(payload);
			buffer = Buffer.concat(buffer ? [buffer, chunk] : [chunk]);
			if (isdone) {
				const middleware = this.#middleware;
				for (let index = 0, l = middleware.length; index < l; index++) {
					const [condition, hook] = middleware[index];
					if (condition(this)) {
						let output = hook(buffer, this, res);
						if (!is.undefined(output) && output !== YIELD) {
							buffer = output;
							break;
						}
					}
					
				}
				buffer === HANDLED ?
					onerror && onerror(
						`${
							this.#request.status
						} ${
							STATUS_CODES[this.#request.status]
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

	yield(y = true) {
		return this.#request.setYield(y) && YIELD;
	}
}

export class Response extends Type({
	status: String,
	type: 'text/plain'
}) {
	#ip;
	#request; // <-- Surf
	#response; // <-- uWS
	#middleware = [];
	
	#title = [];
	#headers = [
		["Surfs-Up", "v0.1 - Awesome"]
	];
	#timestamp = 0;

	#aborted = false;
	#onabort = DO_NOTHING;
	#sends = 0;

	get ip() {
		return this.#ip ?? (this.#ip = DECODE(
			this.#response.getRemoteAddressAsText()
		).replace(/0000/g, ''));
	}

	get id() {
		const routes = this.#request.route.split(SLASH);
		const last = routes.pop();
		routes.push(last.startsWith(COLON) ? 'item' : 'index');
		return routes.filter(x => x && !x.startsWith(COLON)).join(SLASH);
	}

	get title() {
		return this.#title.join(` ${PIPE} `) || this.id;
	}

	set title(title) {
		return this.#title.unshift(title) && this.#title;
	}

	get headers() {
		return this.#headers;
	}

	set headers(more_headers) {
		return this.#headers = this.#headers.concat(
			more_headers instanceof Array ?
				more_headers : Object.entries(more_headers));
	}

	get time() {
		return Date.now() - this.#timestamp; // ms
	}

	get aborted() {
		return this.#aborted;
	}

	constructor(res, middleware) {
		super({
			status: STATUS.OK
		});
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
		if (!value)
			return this.#headers.filter(([k]) => k === key).map(([k, v]) => v).join(PIPE);
		this.#headers.push([key, value]);
		return this;
	}

	send_buffer(buffer, size, success, rs) {
		console.log(`\r 📡 FILE STREAM                                   `);
		console.log(  '------------------------------------------------------------ ');
		console.log(  `  FILE: ${this.#request.uri}                      `);
		console.log(  `  OFFSET: ${buffer.byteLength}                    `);
		console.log(  `  SIZE: ${size}                                   `);

		let [ok, done] = this.#response.tryEnd(buffer, size);
		if (done) {
			console.log(  '------------------------------------------------------------ ');
			console.log(` ✅ FILE '${this.#request.uri}' SENT in ${this.time}ms                   `);
			success ?? success();
			rs ?? rs.destroy();
		}
		console.log(  '------------------------------------------------------------ ');

		return ok;
	}
	
	async send(body = '', status = STATUS.OK, headers = []) {
		if (this.#aborted)
			return YIELD;
		
		const res = this.#response;
		if (++this.#sends > 5) {
			res.writeStatus(this.status = STATUS.LoopDetected)
				.end(`${
					STATUS.LoopDetected
				} LOOP DETECTED (more than 5 attempts to send on the same request)`);
			return HANDLED;
		}
		this.status = status;
		
		const req = this.#request;
		const middleware = this.#middleware;
		
		for (let index = 0, l = middleware.length; index < l; index++) {
			const [condition, hook] = middleware[index];
			if (condition(req, this)) {
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
			this.title && this.header('Content-Title', this.title);
			this.header('Content-Type', this.type);
			const session_id = this.#request.session?.id;
			if (session_id)
				this.header(
					'Set-Cookie',
					`session-id=${session_id}; Secure; HttpOnly; SameSite=Strict`
				);

			// TODO: console outputs should be a hook/callback
			console.log(`\r 📤 OUTBOUND RESPONSE ${req.uri} [${this.type}]              `);
			console.log(  '------------------------------------------------------------ ');
			console.log(  `  DESTINATION: ${this.ip}                         `);
			console.log(  `  HOST: ${req.host}`);
			console.log(  `  ROUTE: ${req.route}                             `);
			console.log();

			if (this.headers.length) {
				console.log(this.headers.map(([key, value]) =>
					`  ${key} = ${value.length > 54 ? value.substr(0, 54) + '...' : value}`).join(NEWLINE));
				console.log();
			}
			const accepted = req.accepted;
			if (accepted && !accepted.includes('*/*') && !accepted.includes(this.type))
				console.warn(`    * 😕 WARNING: "${this.type}" is not specified in recipient's accept list.\n`);

			console.log(`   ${
				status >= 500 ? '🔴' :
					status >= 400 ? '⭕' :
						status >= 300 ? '🔶' :
							status >= 200 ? '🔵' : '🆗'
				} STATUS: ${status} ${STATUS_CODES[status]}\n`);
			console.log(  ` ✅ RESPONSE SENT in ${this.time}ms               `);
			console.log(  '------------------------------------------------------------ ');
			// TODO

			res.cork(() => {
				res.writeStatus(status);
				this.headers.forEach(([key, value]) => res.writeHeader(key, value));
				res.end(body);
			});
		}

		return HANDLED;
	}

	redirect(uri = '/', status = STATUS.Found) {
		return ![
			STATUS.Found,
			STATUS.MovedPermanently,
			STATUS.TemporaryRedirect,
			STATUS.PermanentRedirect
		].includes(status) ?
			this.error(`REDIRECT ERROR: INVALID STATUS '${status}'`) :
				this.send(
					`${status} RESOURCE ${STATUS_CODES[status].toUpperCase()} => ${uri}`,
					status,
					[
						['Location', uri]
					]
				);
	}

	created(uri, body = `${STATUS.Created} RESOURCE CREATED => ${uri}`) {
		return this.send(body, STATUS.Created, [['Location', uri]]);
	}

	not_found(body = `${STATUS.NotFound} RESOURCE NOT FOUND`) {
		return this.send(body, STATUS.NotFound);
	}

	error(body = `${STATUS.InternalServerError} INTERNAL SERVER ERROR`) {
		return this.send(body, STATUS.InternalServerError);
	}

	unauthorized(type = 'Basic', realm = "Access to privileged data.") {
		const status = STATUS.Unauthorized;
		return this.send(
			`${status} ${STATUS_CODES[status].toUpperCase()} => "${realm}"`,
			status,
			[
				["WWW-Authenticate", `${type} realm="${realm}", charset="UTF-8"`]
			]
		);
	}

	forbidden(body = `${STATUS.Forbidden} ACCESS FORBIDDEN`) {
		return this.send(body, STATUS.Forbidden);
	}

	stream(
		stream, // Any JavaScript stream: they all have the same API, right?
		size, // What about live streams? Number.POSITIVE_INFINITY
		success = DO_NOTHING,
		onerror = DO_NOTHING,
		onabort = DO_NOTHING
	) {
		const res = this.#response;
		let buffer;
		let l_offset;

		stream.on('data', chunk => {
			if (!this.send_buffer(buffer = BUFF(chunk), size, success, stream)) {
				stream.pause();
				l_offset = res.getWriteOffset();
			}
		}).on('error', e => {
			console.log(  ` 💔 FILE STREAM ERROR ${e}                        `);
			console.log(  '------------------------------------------------------------ ');
			this.close();
			onerror(e);
		});
		this.onabort(e => {
			console.log(  ` 🙅 USER ABORTED FILE STREAM ${e}                 `);
			console.log(  '------------------------------------------------------------ ');
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
		const size = stats(filename).size;
		const type = mime.getType(filename);
		const req = this.#request;
		const res = this.#response;

		console.log(`\r 📂 FILE HEAD ${req.uri} [${type}]                         `);
		console.log('------------------------------------------------------------ ');
		console.log(`  DESTINATION: ${this.ip}`);
		console.log(`  PATH: ${filename}`);
		console.log(`  SIZE: ${size}`);
		console.log('------------------------------------------------------------ ');
		
		res.writeStatus(STATUS.OK)
			.writeHeader("Content-Type", type);

		return size;
	}

	file(filename, success, onerror, onabort) {
		console.log(`\r 💾 FILE DOWNLOAD @ ${ this.#request.host }${ this.#request.uri }`);
		console.log(  '------------------------------------------------------------ ');
		return exists(filename) ?
			this.stream(
				read_stream(filename),
				this.file_head(filename),
				success,
				onerror,
				onabort
			) : this.not_found();
	}

	live_stream(mime_type, stream, oncomplete, onerror, onabort) {
		this.#response.writeStatus(STATUS.OK)
			.writeHeader("Content-Type", mime_type);
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

	yield(y = true) {
		return this.#request.setYield(y) && YIELD;
	}
}

export class Socket extends Type {
	#ip;
	#id;
	#timestamp;
	#socket;
	#mountpoint;
	#middleware;

	get ip() {
		return this.#ip ?? (this.#ip = DECODE(
			this.#socket.getRemoteAddressAsText()
		).replace(/0000/g, ''));
	}

	get id() {
		return this.#id || this.ip;
	}

	set id(id) {
		return this.#id = id;
	}

	get time() {
		return Date.now() - this.#timestamp; // ms
	}

	get backpressure() {
		return this.#socket.getBufferedAmount();
	}

	constructor(mountpoint, socket, middleware) {
		super();
		this.#mountpoint = mountpoint;
		this.#socket = socket;
		this.#middleware = middleware;
		this.reset();
	}

	cork(callback) {
		this.#socket.cork(callback);
		return HANDLED;
	}

	pipe(msg) {
		const is_binary = msg instanceof Binary;
		console.log(`\r 📨 SOCKET OUTBOUND MESSAGE`);
		console.log('------------------------------------------------------------');
		console.log(`  ROUTE: ${this.#mountpoint}`);
		console.log(`  BINARY: ${is_binary}`);
		console.log({...msg});

		msg = is_binary ?
			this.#middleware.write(msg, this) :
				this.#middleware.stringify(msg, this);
		console.log('------------------------------------------------------------');
		return [
			msg,
			is_binary
		];
	}

	send(msg, compress = false) {
		this.#socket.send(...this.pipe(msg), compress);
		return HANDLED;
	}

	publish(topic, msg, compress = false) {
		this.#socket.publish(topic, ...this.pipe(msg), compress);
		return HANDLED;
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
		this.#socket.end(code, String(msg));
		return HANDLED;
	}

	close() {
		this.#socket.close();
		return HANDLED;
	}

	wraps(socket) {
		return this.#socket === socket;
	}

	reset() {
		this.#timestamp = Date.now();
		return this;
	}
}

export class Peers extends Array {
	constructor(...args) {
		super(...args);
	}

	send(msg, compress = false) {
		this.forEach(socket => socket.send(msg, compress));
		return HANDLED;
	}

	get(socket) {
		return this.find(s => s.wraps(socket))?.reset();
	}

	add(socket, mountpoint, middleware) {
		const s = new Socket(mountpoint, socket, middleware);
		s.id = this.push(s);
		return s;
	}

	remove(socket) {
		const i = this.findIndex(s => s.wraps(socket));
		return this.splice(i, 1)[0]?.reset();
	}
}

export class Listener extends Type({
	compression: UInt,
	maxPayloadLength: UInt,
	maxBackpressure: UInt,
	idleTimeout: class MultipleOf4 extends UInt {
		static defines(instance) {
			return instance instanceof Number && instance % 4 === 0;
		}
	},

	open: Function,
	message: Function,
	close: Function,
	drain: Function
}) {
	#peers = new Peers();
	static SOCKETS_IN_USE = 0;

	constructor(mountpoint, hooks, middleware) {
		if (is.function(hooks))
			hooks = {
				message: hooks
			};
		super({
			compression: Server.DISABLED,
			maxPayloadLength: 16 * 1024,
			maxBackpressure: 1024,
			idleTimeout: 0,

			open: socket => {
				socket = this.#peers.add(socket, mountpoint, middleware);
				console.log(`\r 📭 SOCKET #${socket.id} OPEN                            `);
				console.log('------------------------------------------------------------');
				console.log(`  IP: ${socket.ip}`);
				console.log(`  ROUTE: ${mountpoint}`);
				console.log(`  PEERS: ${this.#peers.length}`);
				console.log('------------------------------------------------------------');

				Listener.SOCKETS_IN_USE++;
				hooks.open?.(socket, this.#peers);

				console.log(`  TIME: ${socket.time}ms`);
				console.log('------------------------------------------------------------');
			},
			message: (socket, message, is_binary) => {
				socket = this.#peers.get(socket);
				console.log(`\r 📬 SOCKET #${socket.id} RECEIVED MESSAGE                `);
				console.log('------------------------------------------------------------');
				console.log(`  IP: ${socket.ip}`);
				console.log(`  ROUTE: ${mountpoint}`);
				console.log(`  BINARY: ${is_binary}`);

				if (message !== HANDLED && message !== YIELD) {
					message = is_binary ?
						middleware.read(message, socket) :
							middleware.parse(DECODE(message), socket);
					
					console.log({...message});
					console.log('------------------------------------------------------------');

					const rtrn = hooks.message(
						message,
						socket,
						this.#peers
					);
					if (rtrn && rtrn !== HANDLED && rtrn !== YIELD)
						socket.send(rtrn);
				}

				console.log(`  TIME: ${socket.time}ms`);
				console.log('------------------------------------------------------------');
			},
			close: (socket, code, reason) => {
				socket = this.#peers.remove(socket);
				reason = DECODE(reason);
				console.log(`\r 📪 SOCKET #${socket.id} CLOSED                          `);
				console.log('------------------------------------------------------------');
				console.log(`  IP: ${socket.ip}`);
				console.log(`  ROUTE: ${mountpoint}`);
				console.log(`  REASON: ${code} ${reason}`);
				console.log(`  PEERS: ${this.#peers.length}`);
				console.log('------------------------------------------------------------');

				Listener.SOCKETS_IN_USE--;
				hooks.close?.(code, reason, socket, this.#peers);

				console.log(`  TIME: ${socket.time}ms`);
				console.log('------------------------------------------------------------');
			},
			drain: socket => {
				socket = this.#peers.get(socket);
				console.log(`\r 📫 SOCKET #${socket.id} DRAIN                           `);
				console.log('------------------------------------------------------------');
				console.log(`  IP: ${socket.ip}`);
				console.log(`  ROUTE: ${mountpoint}`);
				console.log(`  BACK PRESSURE: ${socket.backpressure}`);
				console.log('------------------------------------------------------------');

				hooks.drain?.(socket, this.#peers);

				console.log(`  TIME: ${socket.time}ms`);
				console.log('------------------------------------------------------------');
			},
		});
	}
}

export class Endpoint extends Type {
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

export class Router extends Type(Emitter, {
	_name: String
}) {
	constructor(name, routes) {
		super();

		if (!routes) {
			routes = name;
			name = this.constructor.name;
		}
		
		this._name = name;

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
	#handling = false;
	#requests = 0;
	#sessions;

	#middleware = [];
	#bodyware = {
		parse: [
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
			// ANY REDIRECT:
			[
				(req, res) => res.header('Location'),
				() => null
			],
			// PLAIN TEXT RESPONSE (DEFAULT)
			[
				() => true,
				body => String(body)
			]
			// TODO: handle binary by default
		]
	};
	#socketware = {
		parse(string) {
			return String(value);
		},
		stringify(value) {
			return String(value);
		},
		read(body, socket) {
			return body;
		},
		write(body, socket) {
			return body;
		}
	};

	constructor(router) {
		super();
		this.#router =
			router instanceof Router ?
				router : new Router(router);
		
		// DEFAULT BODYWARE AND SOCKETWARE:
		this.bodyware(BODYWARE_JSON);
		this.socketware(SOCKETWARE);
	}

	sessionware(intercept = {}) {
		this.#sessions = new Collection(intercept);
		return this;
	}

	middleware(...intercepts) {
		this.#middleware.push(...intercepts);
		return this;
	}

	bodyware(...intercepts) {
		intercepts.reverse().forEach(({parse, stringify}) => {
			parse && this.#bodyware.parse.unshift(parse);
			stringify && this.#bodyware.stringify.unshift(stringify);
		});
		return this;
	}

	socketware(intercept) {
		this.#socketware.assign(intercept);
		return this;
	}

	parse(router, mount = SLASH) {
		const app = this.#app;
		
		console.log(  '------------------------------------------------------------ ');
		if (mount === SLASH)
			console.log(  ` 🔝 ${router._name}`);
		else
			console.log(  ` 🔀 ${mount} 🡺 ${router._name}`);
		
		// We have this catch for ALL routers execept for any that have been mixed-in!
		router["/*"] = router["/*"] ?? new Endpoint((req, res) => res.not_found());
		router.forEach(([pattern, endpoint]) => {
			const mountpoint = CONCAT(mount, pattern);
			
			if (endpoint instanceof Router)
				return this.parse(endpoint, mountpoint);

			if (!mountpoint.endsWith('*')) {
				console.log(  '------------------------------------------------------------ ');
				console.log(  ` 🔗 ${mountpoint}`);
			}

			endpoint.forEach(([method, hook]) => {
				if (is.undefined(hook))
					return;
				
				if (!mountpoint.endsWith('*') && method !== "any")
					console.log(`     ✔ ${method.toUpperCase()}`);

				if (method === "listen") {
					const listener = new Listener(mountpoint, hook, this.#socketware);
					listener.forEach(([channel, handle]) => {
						console.log(
							`       -`,
							channel,
							is.function(handle) ?
								((is.function(hook) && channel === "message") || hook[channel] ?
									'👀' :
										'💤' ):
											handle);
					});
					app.ws(mountpoint, listener);
				} else {
					app[method](
						mountpoint,
						async (res, req) => {
							this.#handling = true;
							this.#requests++;

							console.log();
							console.log('------------------------------------------------------------ ');
							console.log(` 📥 INCOMING REQUEST ${ req.getMethod().toUpperCase() } ${ req.getUrl() } [${ req.getHeader('content-type') || '*/*' }]`);
							console.log('------------------------------------------------------------ ');

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
									this.#bodyware.parse,
									this.#sessions
								);

							console.log(`  ORIGIN: ${request.ip}`);
							console.log(`  HOST: ${request.host}`);
							console.log(`  ROUTE: ${request.route}`);
							console.log();
							console.log(request.headers.map(([key, value]) =>
								`  ${key} = ${
									value.length > 54 ?
										value.substr(0, 54) + '...' : value
								}`).join(NEWLINE));
							console.log('------------------------------------------------------------ ');

							const middleware = this.#middleware;
							for (let index = 0, l = middleware.length; index < l; index++) {
								if (middleware[index](request, response) === HANDLED)
									return;
							}

							const output = await hook(request, response);
							
							if (is.undefined(output))
								return this.send(
									`${
										STATUS.BadGateway
									} Bad Gateway -- ${
										request.method
									} handler returned UNDEFINED`,

									STATUS.BadGateway
								);

							if (output !== HANDLED) {
								if (output === YIELD) {
									console.log(`- 🚩 YIELD ${request.route}`);
									console.log('------------------------------------------------------------ ');
								}
								else if (output === BAD_REQUEST)
									await request.bad_request();
								else if (output === BAD_METHOD)
									await request.bad_method();
								else if (output === UNAUTHORIZED)
									await response.unauthorized();
								else if (output === OK)
									await response.send(); // Just say hello!
								else
									await response.send(output);
							}
							
							const session = request.session;
							if (session)
								this.#sessions.update(session.id, session.data);
							
							this.#handling = false;
						}
					)
				}
			});
			
		});
	}

	listen(...args) {
		if (!(args[0] instanceof UInt))
			args.unshift(9001);
		const [
			port = process.env.PORT || 9000,
			success = DO_NOTHING,
			error = DO_NOTHING
		] = args;

		console.log('------------------------------------------------------------ ');
		console.log(` 🏄 STARTING SURF SERVER                          `);
		console.log(` 📆 ${new Date().toLocaleString().replace(COMMA, ' ⌚')}`);
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

		this.#app.listen(port, socket => {
			console.log('------------------------------------------------------------ ');
			if (socket) {
				const timestamp = Date.now();

				console.log(` ✅ SERVER STARTED ⚓ ${port}          `);
				success(port, socket);

				setInterval(() => {
					if (!this.#handling) {
						const uptime = Math.ceil((Date.now() - timestamp) / 1000);
						process.stdout.write(
							`\r 💁 REQUESTS: ${
								this.#requests
							}  👥 PEERS: ${
								Listener.SOCKETS_IN_USE
							}  🎫 SESSIONS: ${
								this.#sessions?.size || 0
							}  ${
								CLOCK[uptime % 12]
							} UPTIME: ${
								uptime
							}s  `);
					}
				}, 250);
			}
			else {
				console.log(` 🇽 ERROR BINDING TO SOCKET ⚓ ${port}`)
				error(port, socket);
			}
			console.log('------------------------------------------------------------ ');
		});
		return this;
	}
}

export default function surf(router) {
	return new Surf(router);
};