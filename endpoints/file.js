import { HANDLED } from "../constants.js";
import { Endpoint } from "../index.js";

export default class File extends Endpoint {
	constructor(path) {
		super({
			head(req, res) {
				return res.file_head(path) && HANDLED;
			},
			get(req, res) {
				return res.file(path);
			}
		});
	}
}