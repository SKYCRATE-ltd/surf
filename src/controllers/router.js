import { Emitter } from "zed";

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
	authware(hook) {
		if (hook)
			this.forEach(
				([route, endpoint]) => // Is this the best way to apply authware? Probably...
					endpoint.authware(hook)
			);
		return this;
	}
}