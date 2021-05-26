import { writeFileSync } from "fs";
import { mkdir } from "computer";
import { Class } from "zed";
import { Router, File, Username } from "./index.js";
import Crud from "./routers/crud.js";
import Directory from "./routers/directory.js";

// TODO: Why can't we just extend Router? Debug this...
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
				async index(model, { page, index, incr }, req, res) {
					if (req.session.data?.user) // we are logged-in!
						return await model.findMany(index < 0 ? {
							skip: (page - 1) * incr,
							take: incr
						} : {
							cursor: index,
							take: incr
						});
					return res.redirect(`./login`); // <-- Take us to the login page!
				},
				async create(model, data, req, res) {
					return res.redirect(`./${await model.create({data}).id}`);
				}
			}),

			"/users": new Crud("User", {
				"handle*": Username,
				"status": String,
				"bio": String,
				"avatar": File('image/jpeg', 'image/png', 'image/gif'),
			}, {
				async index(model, { page, index, incr }) {
					return await model.findMany(index < 0 ? {
						skip: (page - 1) * incr, // This will always be the same...
						take: incr
					} : {
						cursor: index,
						take: incr
					});
				},
				async create(model, { handle, status, bio, avatar }, req, res) {
					let user = await model.create({
						data: {
							handle,
							profile: {
								create: { status, bio }
							}
						}
					});
					if (avatar) {
						const user_dir = `uploads/users/${user.id}`;
						const path = `${DIR}/data/${user_dir}`;
						mkdir(path);
						writeFileSync(`${path}/${avatar.filename}`, avatar.data);
						
						user = await model.update({
							where: {
								id: user.id
							},
							data: {
								avatar: `/${user_dir}/${avatar.filename}`
							}
						});
					}
					req.session.update({user});
					return res.redirect(`./${user.handle}`);
				},
				async new(model) {
					// This is where we return a creation form...
					// Is this how I should go about it?
					return {

					}
				}
			}),

			// We wanna do a get/post here...
			// the post data will also need to be verified...

			// OKIE DOKES.
			"/login": (req, res) => {
				if (req.session.data?.user) {
					// We are already logged-in!
					res.redirect(`../users/${req.session.data.user.id}`);
				}
				// Display the login page!
				// What info does a login page need?
				// We should create a Form object...
				// and that's what we return to display the login page...
				// Actually... all forms could be abstract lolololol....
				return {
					postback: `../users`,
					fields: {
						"handle*": "username",
						"status": "text",
					}
					// 
					// We have our "Type/Interface" at the top...
					// We could totally
				}
			},

			"/uploads": new Directory(`${DIR}/data/uploads`),
		})
	}
}