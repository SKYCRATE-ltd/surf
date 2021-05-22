import { Class } from "zed";
import { Router } from "./index.js";
import Crud from "./routers/crud.js";
import Directory from "./routers/directory.js";

export default class App extends Class(Router) {
	constructor(DIR = '.') {
		super({
			...new Directory(`${DIR}/public/icons`), // Append our icons to the root
			...new Directory(`${DIR}/public`, 'icons/'), // Append our public folder (except icons/) to root.
			
			...new Crud("Room", {
				"name*": String,
				"description": String,
				"passphrase": String
			}, {
				index(model, { page, index, incr }) {
					return model.findMany(index < 0 ? {
						skip: (page - 1) * incr,
						take: incr
					} : {
						cursor: index,
						take: incr
					});
				},
				create(model, data) {
					
				}
			}),

			"/uploads": new Directory(`${DIR}/data/uploads`),
		})
	}
}