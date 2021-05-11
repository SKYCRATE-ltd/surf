import { Type } from "zed";
import { HANDLED } from "../constants.js";
import { Endpoint } from "../index.js";

const SUBSCRIBE = 'subscribe';
const PAGE = 'page';
const USER = 'user';
const PAYMENTS = 'payments';

const OBJECTS = {
	[USER]: '👤',
	[PAGE]: '📄',
	[PAYMENTS]: '💰',
};

export default class Webhook extends Type(Endpoint) {
	constructor(
		hooks = {},
		app_secret = process.env.APP_SECRET || '',
	) {
		super({
			get(req, res) {
				const query = req.query;
				let mode = query['hub.mode'];
				let token = query['hub.verify_token'];
				let challenge = query['hub.challenge'];

				console.log(`\r 🐟 WEBHOOK VALIDATION ENDPOINT                              `);
				console.log(  '------------------------------------------------------------ ');
				console.log(  `  MODE: ${mode}`);
				console.log(  `  TOKEN: ${token}`);
				console.log(  `  CHALLENGE: ${challenge}`);
				console.log(  '------------------------------------------------------------ ');

				if (mode === SUBSCRIBE && token === app_secret) {
					console.log(` ✅ WEBHOOK VERIFIED                                         `);
					console.log('------------------------------------------------------------ ');
					return res.send(challenge);
				}
				
				console.log(  ` ⛔ WEBHOOK VALIDATION FAILED                                `);
				console.log(  '------------------------------------------------------------ ');
				return req.bad_request();
			},
			post(res, req) {
				req.body(data => {
					console.log(`\r 🎣 WEBHOOK EVENT RECEIVED [${OBJECTS[data.object]} ${data.object}]`);
					console.log(  '------------------------------------------------------------ ');

					data.entry.forEach(entry => {
						if (data.object === PAGE) {
							entry.messaging?.forEach(event => {
								console.log(`  SENDER: ${event.sender.id}`);
								console.log(`  PAGE: ${event.recipient.id}`);
								console.log('------------------------------------------------------------ ');

								hooks.messenger?.(event);
							});
						} else if (data.object === USER) {
							console.log(`  USER: ${entry.id}`);
							console.log(`  CHANGES: ${entry.changes.length}`);
							console.log('------------------------------------------------------------ ');

							hooks.user?.(entry);
						} else if (data.object === PAYMENTS) {
							console.log(`  PAYMENT: ${entry.id}`);
							console.log(`  UPDATES: ${entry.changed_fields.length}`);
							console.log('------------------------------------------------------------ ');

							hooks.payments?.(entry);
						}
					});

					console.log(`\r ✅ WEBHOOK EVENT COMPLETED                                  `);
					console.log(  '------------------------------------------------------------ ');
					return res.send(); // <-- 200 OK!
				});
				return HANDLED; // <-- Good to be explicit!
			}
		});
	}
}