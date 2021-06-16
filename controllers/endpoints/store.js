import { is } from "crux";
import { NOT_FOUND, BAD_REQUEST } from "../../src/constants.js";
import { Endpoint } from "../../index.js";

export class Store extends Endpoint {
	constructor(name, authority, hooks) {
		const model = client[name.toLowerCase()];

		if (!model)
			throw `!ERROR! No such model "${name}" found.`;
		
		if (is.function(hooks))
			hooks = {
				get: hooks
			};

		super(hooks);
		authority && this.authware(authority);
	}
}

export class Index extends Store {
	constructor(name, authority, hook, options = {}) {
		super(
			name,
			authority,
			{
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
			}
		);
	}
}

export class Form extends Store {
	constructor(name, authority, descriptor, hooks) {
		if (is.function(hooks))
			hooks = {
				get: hooks
			};
		
		super(name, authority, hooks); // <-- More than this?
		// Since we're validating... we should be fetching our body automagically...
		// booya!!
		this.validware(descriptor);
	}
}

// eah... we're a;ready getting the body... check yoself.
export class Read extends Store {
	constructor(name, authority, hook) {
		super(
			name,
			authority,
			async (model, req, res) =>
				await hook(model, req.args.id ?? -1, req, res)
		);
	}
}

export class Create extends Form {
	constructor(name, authority, descriptor, hook) {
		super(
			name,
			{
				post: authority
			},
			descriptor,
			{
				async post(model, req, res) {
					return await hook(
						model,
						await req.body(),
						req,
						res
					);
				}
			}
		);
	}
}

export class Update extends Form {
	constructor(name, authority, descriptor, hook) {
		super(
			name,
			{
				patch: authority,
				put: authority // <-- This MIGHT change
			},
			descriptor,
			{
				async patch(model, req, res) {
					return await hook(model, req.args.id ?? -1, body, req, res);
				},
				async put(model, req, res) {
					return await hook(model, req.args.id ?? -1, body, req, res);
				}
			}
		);
	}
}

export class Delete extends Store {
	constructor(name, authority, hook) {
		super(
			name,
			{
				del: authority
			},
			{
				async del(model, req, res) {
					return await hook(model, req.args.id ?? -1, req, res);
				}
			}
		);
	}
}