import { Type, Hook } from "zed";
import Entry from "../models/entry.js";

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

	constructor(route, req, res, middleware, data) {
		super({
			route: route,
			uri: req.getUrl(),
			method: req.getMethod().toUpperCase()
		});
		res.init(this);

		this.#request = req; // uWS
		this.#response = res; // Surf
		this.#middleware = middleware;

		// TODO: API sessions...
		if (data.session && this.accepted.includes('text/html')) {
			// Hm is this the way? Should we wrap it with the Map we had? is that really best?
			this.session = data.session.findUnique(
				// Otherwise we have to use this brand of API...
				// hmmmmmmm Not sure I love it but we'll continue
				{
					where: {
						id: this.cookies['session-id']
					}
				}) || data.session.create({
					data: {
						token: uuid() // <-- make sure we include this.
					}
				});
			//
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
		return this.#response.send(body, STATUS.BadRequest);
	}

	bad_method(
		body = `${STATUS.MethodNotAllowed} METHOD '${this.method}' NOT ALLOWED/SUPPORTED`
	) {
		return this.#response.send(body, STATUS.MethodNotAllowed);
	}

	unauthorized(type = 'Basic', realm = "Access to privileged data.") {
		const status = STATUS.Unauthorized;
		return this.#response.send(
			`${status} ${STATUS_CODES[status].toUpperCase()} => "${realm}"`,
			status,
			[
				["WWW-Authenticate", `${type} realm="${realm}", charset="UTF-8"`]
			]
		);
	}

	yield(y = true) {
		return this.#request.setYield(y) && YIELD;
	}
}