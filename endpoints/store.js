import prisma from "@prisma/client";
import { is } from "crux";
import { Interface } from "zed";
import { NOT_FOUND, BAD_METHOD, BAD_REQUEST, UNAUTHORIZED } from "../constants.js";
import { Endpoint } from "../index.js";

const { PrismaClient } = prisma;
export const client = new PrismaClient();
export default client;

export class Store extends Endpoint {
	constructor(name, hooks, authorise = req => true) {
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
	constructor(name, hook, authorise, options = {}) {
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
		}, authorise);
	}
}

export class Create extends Store {
	constructor(name, descriptor, hook, authorise) {
		super(name, {
			async post(model, req, res) {
				const body = await req.body();
				if (!(body instanceof Interface(name, descriptor)))
					return BAD_REQUEST;
				return await hook(model, body, req, res);
			}
		}, authorise);
	}
}

export class Read extends Store {
	constructor(name, hook, authorise) {
		super(name, {
			async get(model, req, res) {
				return await hook(model, req.args.id, req, res);
			}
		}, authorise);
	}
}

export class Update extends Store {
	constructor(name, descriptor, hook, authorise) {
		super(name, {
			async patch(model, req, res) {
				const body = await req.body();
				if (entries(body).every(([key, value]) => descriptor[key] ?? value instanceof descriptor[key]))
					return await hook(model, req.args.id, body, req, res);
				return BAD_REQUEST;
			},
			async put(model, req, res) {
				const body = await req.body();
				if (body instanceof Interface(name, descriptor))
					return await hook(model, req.args.id, body, req, res);
				return BAD_REQUEST;
			}
		}, authorise);
	}
}

export class Delete extends Store {
	constructor(name, hook, authorise) {
		super(name, {
			async del(model, req, res) {
				if (!authorise(req))
					return UNAUTHORIZED;
				return await hook(model, req.args.id, req, res);
			}
		}, authorise);
	}
}