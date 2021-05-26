import prisma from "@prisma/client";
import { is } from "crux";
import { NOT_FOUND, BAD_METHOD, BAD_REQUEST, UNAUTHORIZED } from "../constants.js";
import { Endpoint } from "../index.js";

const { PrismaClient } = prisma;
export const client = new PrismaClient();
export default client;

export class Store extends Endpoint {
	constructor(name, hooks) {
		const model = client[name.toLowerCase()];

		if (!model)
			throw `!ERROR! No such model "${name}" found.`;
		
		if (is.function(hooks))
			hooks = {
				get: hooks
			};

		super(
			hooks.map(
				([key, hook]) => [
					key,
					async (req, res) => {
						if (!authorise(req))
							return UNAUTHORIZED;
						return await hook(model, req, res) ?? BAD_METHOD;
					}
				]
			)
		);
	}
}

export class Index extends Store {
	constructor(name, hook, options = {}) {
		super(name, {
			async get(model, req, res) {
				const {
					// defaults
					page = 1,
					index = -1,
					incr = options.incr ?? 10,
				} = req.query;

				if (incr < 1)
					return BAD_REQUEST;
				
				if (index > -1)
					return await hook(model, { index, incr }, req, res) ?? NOT_FOUND;

				const total = Math.ceil(model.count() / incr);
				
				if (page > total)
					return NOT_FOUND;
				
				if (page > 1)
					res.header(
						'Content-Prev',
						page == 2 ?
							'./' : `./?page=${page - 1}`
					);
				
				if (page < total)
					res.header(
						`Content-Next`,
						`./?page=${page + 1}`
					);
				
				res.header(
					`Content-Canonical`,
					page == 1 ?
						'./' : `./?page=${page}`
				);

				return await hook(model, { page, incr }, req, res) ?? NOT_FOUND;
			}
		});
	}
}

export class Form extends Store {
	constructor(name, descriptor, hooks) {
		if (is.function(hooks))
			hooks = {
				get: hooks
			};
		
		super(name, hooks); // <-- More than this?
		this.validware(descriptor);
	}
}

export class Read extends Store {
	constructor(name, authority, hook) {
		super(name, async (model, req, res) =>
			await hook(model, req.args.id ?? -1, req, res));
	}
}

export class Create extends Form {
	constructor(name, authority, descriptor, hook) {
		super(name, descriptor, {
			async post(model, req, res) {
				return await hook(model, body, req, res);
			}
		});
		this.authware({
			post: authority
		});
	}
}

export class Update extends Form {
	constructor(name, authority, descriptor, hook) {
		super(name, descriptor, {
			async patch(model, req, res) {
				return await hook(model, req.args.id ?? -1, body, req, res);
			},
			async put(model, req, res) {
				return await hook(model, req.args.id ?? -1, body, req, res);
			}
		});
		this.authware({
			patch: authority,
			put: authority // <-- This MIGHT change
		});
	}
}

export class Delete extends Store {
	constructor(name, authority, hook) {
		super(name, {
			async del(model, req, res) {
				return await hook(model, req.args.id ?? -1, req, res);
			}
		});
		this.authware({
			del: authority
		});
	}
}