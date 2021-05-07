 import {
	fileURLToPath
} from 'url';
import {
	dirname
} from 'path';
import JST from "jst";
import surf, { STATUS } from "./index.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const jst = new JST(`${DIR}/views`);

const render = jst.layout('layout');

// surf(
// 	req => `[${req.method}] "Hello, World" from ${req.host}`
// )
// surf({
// 	"/": req => `[${req.method}] "Hello, World" from ${req.host}`
// })
surf({
	"/": {
		get(req, res) {
			res.id = 'index'; // <-- there MUST be a better way...
			res.title = 'WAVE - Surf Chat Server'
			return `[${req.method}] "Hello, World" from ${req.host}`;
		},
		async post(req) {
			const {hello} = await req.body();
			return {
				message: hello
			};
		},
		listen(msg) {
			console.log(msg);
		}
	},
})
.bodyware({
	stringify: [
		// JST Template stuff!
		[
			req => req.accepted.includes('text/html'),
			async (body, req, res) => {
				res.type = "text/html";
				const id = res.id ||
							(res.status === STATUS.NotFound ?
								'not-found' : 'error');

				if (req.header('x-requested-with')) {
					return await jst.render(
						id,
						{
							item: body
						}
					);
				}
				return await render(
					id,
					body,
					{
						title: res.title || body,
					}
				);
			}
		]
	]
})
.listen(9009);

