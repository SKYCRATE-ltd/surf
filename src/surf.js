import { CLOCK } from "./constants.js";
import { Emitter } from "zed";
import BodyJson from "../bodyware/json.js";
import Form from "../bodyware/form.js";
import MultipartForm from "../bodyware/multipart.js";
import SocketJson from "../socketware/default.js";


export class Surf extends Emitter {
	#app;
	#router;

	#handling = false;
	#requests = 0;

	#sessions; // <-- This is different now!
	#data = {};

	#middleware = [];
	#bodyware = {
		// TODO: handle binary? File upload without the file...
		parse: [
			// PLAIN TEXT (DEFAULT)
			[
				req => req.type === 'text/plain',
				body => String(body), // <-- Should this be DECODE()?
			],
		],
		stringify: [
			// PLAIN TEXT RESPONSE (DEFAULT)
			[
				() => true,
				body => String(body) // <-- This is fine.
			]
			// TODO: handle binary by default
		]
	};
	#socketware = {
		parse(string) {
			return DECODE(value);
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
		this.bodyware(
			Form,
			MultipartForm,
			BodyJson,
		);
		this.socketware(SocketJson);
	}

	data(data) {
		this.#data = data;
		// Ok... so how should we access this?
		// We can get it through a request? socket?
		return this;
	}

	// Leave for now... but yes, this is essentially a collection...
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
									this.#data
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
									await request.unauthorized();
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