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
		if (last)
			routes.push(last.startsWith(COLON) ? 'item' : `${last}/index`);
		else
			routes.push('index');
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

	open(data) {
		this.#response.writeHeader("Content-Type", "text/event-stream");
		this.#response.writeHeader("Cache-Control", "no-cache");
		const req = this.#request;
		console.log(`\r 📡 EVENT STREAM OPENED @ ${req.uri} ["text/event-stream"]`);
		console.log(  '------------------------------------------------------------ ');
		console.log(  `  CLIENT: ${this.ip}                         `);
		console.log(  `  HOST: ${req.host}`);
		console.log(  `  ROUTE: ${req.route}                             `);
		if (data)
			this.emit(data); // si?
		return this;
	}

	emit(channel, data) {
		this.#response.write(`event: ${channel}\ndata: ${data}\n\n`);
		return this;
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
					null,
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

	forbidden(body = `${STATUS.Forbidden} ACCESS FORBIDDEN`) {
		return this.send(body, STATUS.Forbidden);
	}

	error(body = `${STATUS.InternalServerError} INTERNAL SERVER ERROR`) {
		return this.send(body, STATUS.InternalServerError);
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