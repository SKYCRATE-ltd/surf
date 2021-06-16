import { Class } from "zed";
import { NOT_FOUND, UNAUTHORIZED } from "../../src/constants.js";
import { Store, Index, Create, Read, Update, Delete } from "../endpoints/store.js";
import { Router } from "../../index.js";

const TRUE = () => true;
const FALSE = () => false;

export default class Crud extends Class(Router) {
	constructor(name, authware, descriptor, hooks, options = {}) {
		const { incr = 10 } = options;

		/*
			string,

			{
				// defaults....
				any		=> true		<-- hook into Router
				create	=> false	<-- hook into Endpoint...
				read	=> true
				update	=> false
				delete	=> false
			},

			Interface descriptor,

			{
				index,
				create,
				read,
				update,
				delete,
				edit
			}
		*/
		
		super({
			"/": {
				...new Index(
					name,
					authware.read ?? TRUE,
					async (model, info, req, res) =>
						await hooks.index?.(model, info, req, res) ?? NOT_FOUND
				),
				...new Create(
					name,
					authware.create ?? FALSE,
					descriptor,
					async (model, body, req, res) =>
						await hooks.create?.(model, body, req, res) ?? UNAUTHORIZED
				),
			},
			"/page/:page": new Store(
				name,
				authware.read ?? TRUE,
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
				authware.read ?? TRUE,
				async (model, req, res) => {
					const { index } = req.args;
					return await hooks.index?.(model, { index, incr }, req, res) ?? NOT_FOUND;
				}
			),
			"/:id": {
				...new Read(
					name,
					authware.read ?? TRUE,
					async (model, id, req, res) =>
						await hooks.read?.(model, id, req, res) ?? NOT_FOUND
				),
				...new Update(
					name,
					authware.update ?? FALSE,
					descriptor,
					async (model, id, body, req, res) =>
						await hooks.update?.(model, id, body, req, res) ?? NOT_FOUND
				),
				...new Delete(
					name,
					authware.delete ?? FALSE,
					async (model, id, req, res) =>
						await hooks.delete?.(model, id, req, res) ?? NOT_FOUND
				),
				// Should we put a listen here??
				// It's not a bad idea...
				// Plus we might wanna
			},
			"/:id/edit":
				new Read(
					name,
					authware.update ?? FALSE,
					async (model, id, req, res) =>
						await hooks.edit?.(model, id, req, res) ?? NOT_FOUND
				),
		});
	}
}