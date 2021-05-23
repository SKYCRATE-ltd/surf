import { Class } from "zed";
import { NOT_FOUND, UNAUTHORIZED } from "../constants.js";
import { Store, Index, Create, Read, Update, Delete } from "../endpoints/store.js";
import { Router } from "../index.js";

export default class Crud extends Class(Router) {
	constructor(name, descriptor, hooks, options = {}) {
		const { incr = 10 } = options;
		
		super({
			"/": {
				...new Index(
					name,
					async (model, info, req, res) =>
						await hooks.index?.(model, info, req, res) ?? NOT_FOUND
				),
				...new Create(
					name,
					descriptor,
					async (model, body, req, res) =>
						await hooks.create?.(model, body, req, res) ?? UNAUTHORIZED
				),
			},
			"/new": new Store(
						name,
						async (model, req, res) =>
							await hooks.new?.(model, req, res) ?? NOT_FOUND
						),
			"/page/:page": new Store(
				name,
				async (model, req, res) => {
					const { page } = req.args;

					// TODO: abstract below into a more re-usable function:
					const total = Math.ceil(model.count() / incr);
					
					if (page > total)
						return NOT_FOUND;
					
					if (page > 1)
						res.header(
							'Content-Prev',
							page == 2 ?
								'./' : `./page/${page - 1}`
						);
					
					if (page < total)
						res.header(
							`Content-Next`,
							`./page/${page + 1}`
						);
					
					res.header(
						`Content-Canonical`,
						page == 1 ?
							'./' : `./page/${page}`
					);
					
					return await hooks.index?.(model, { page, incr }, req, res) ?? NOT_FOUND;
				}
			),
			"/index/:index": new Store(
				name,
				async (model, req, res) => {
					const { index } = req.args;
					return await hooks.index?.(model, { index, incr }, req, res) ?? NOT_FOUND;
				}
			),
			"/:id": {
				...new Read(
					name,
					async (model, id, req, res) =>
						await hooks.read?.(model, id, req, res) ?? NOT_FOUND
				),
				...new Update(
					name,
					descriptor,
					async (model, id, body, req, res) =>
						await hooks.update?.(model, id, body, req, res) ?? NOT_FOUND
				),
				...new Delete(
					name,
					async (model, id, req, res) =>
						await hooks.delete?.(model, id, req, res) ?? NOT_FOUND
				),
			},
			"/:id/edit": new Store(
							name,
							async (model, req, res) =>
								await hooks.edit?.(model, req.args.id, req, res) ?? NOT_FOUND
						),
		});
	}
}