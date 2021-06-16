import { Type, Interface } from "zed";
import { UNAUTHORIZED, BAD_METHOD } from "../constants.js";
import { VALIDATOR } from "../utils.js";

export class Endpoint extends Type {
	#descriptor = {};
	#authware = [];

	constructor(hooks) {
		if (is.function(hooks))
			hooks = {
				get: hooks
			};

		if (!hooks.any)
			hooks.any = () => BAD_METHOD;

		hooks = hooks.map(([method, hook]) => [
			method,
			method === 'post' || method === 'put' ?
				VALIDATOR(
					hook,
					body => body instanceof this.#descriptor
				) :
				method === 'patch' ?
					VALIDATOR(
						hook,
						Object.entries(body).every(
							([key, value]) =>
								descriptor[key] ?? value instanceof descriptor[key]
						)
					) : hook
		]);

		super(hooks.map(
			([method, hook]) =>
				[
					method,
					async (req, res) =>
						(this.#authware.every(
							auth => auth[method]?.(req, res) ?? true
						)) ?
							await hook(req, res) : UNAUTHORIZED
				]
		));
	}

	validware(descriptor) {
		if (!descriptor)
			return this.#descriptor;
		this.#descriptor = Interface(descriptor);
		return this;
	}

	authware(hooks) {
		if (hooks) {
			if (is.function(hooks))
				hooks = {
					get: hooks
				};
			this.#authware.push(hooks);
		}
		return this;
	}
}