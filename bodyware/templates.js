import { STATUS } from "../constants.js";
import JST from "jst/backend/index.js";

export default class Templates extends JST {
	stringify = []; // <-- Our bodyware hook

	constructor(title, directory, cache, extension) {
		super(`${directory}/views`, cache, extension);

		const master_render = this.layout('layout');

		this.stringify = [

			req => req.accepted.includes('text/html'),

			async (body, req, res) => {
				res.title = title;
				res.type = "text/html";
				const id = res.status === STATUS.OK ? res.id :
							res.status === STATUS.NotFound ? 'not-found' : 'error';
				
				if (req.header('x-requested-with')) {
					return await this.render(
						id,
						{
							item: body
						}
					);
				}
				return await master_render(
					id,
					body,
					{
						title: res.title,
					}
				);
			}
			
		];
	}
}