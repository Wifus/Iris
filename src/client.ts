// Packages
import Axios from "axios";
import FormData from "form-data";
import EventEmitter from "events";
import { GatewayVersion, GatewayDispatchPayload, RESTGetAPIGatewayBotResult, Routes, RouteBases } from "discord-api-types/v9";

// Project Files
import ShardManager from "./gateway";

// Types
import type TypedEmitter from "typed-emitter";

type Method = `GET` | `PATCH` | `POST` | `PUT` | `DELETE`;

interface ClientEvents {
	debug: (message: string, source: string) => void;
	warn: (message: string, source: string) => void;
	error: (error: string, source: string) => void;
	event: (event: GatewayDispatchPayload, source: string) => void;
}

interface File {
	data: Buffer;
	name: string;
}

/**A client that interacts with Discord*/
export default class Client extends (EventEmitter as new () => TypedEmitter<ClientEvents>) {
	public options: {
		/**Authentication token */
		token: string;
		/**The gateway intents you wish to receive (Default: 0) */
		intents?: number;
	};
	#shards?: ShardManager;

	constructor(options: Client["options"]) {
		super();
		this.options = {
			...options,
			...{
				intents: 0
			}
		};
	}

	log(msg: string, ...src: string[]): void {
		console.log(`[${new Date().toTimeString().split(" ")[0]}]${src.reduce((acc, cur) => acc += `[${cur}]`, "")} ${msg}`);
	}

	/**Requests something from the Discord REST API */
	async request(route: string, method: Method = `GET`, body?: Record<string, unknown>, files?: File[]) {
		try {
			let data = new FormData();
			let headers = {
				...data.getHeaders(),
				Authorization: `Bot ${this.options.token}`
			};

			if (body) data.append("payload_json", JSON.stringify(body));

			for (const [index, file] of files?.entries() ?? []) {
				data.append(`files[${index}]`, file.data, file.name);
			}

			const response = await Axios.request({
				url: `${RouteBases.api}${route}`,
				method,
				data,
				headers
			});
			return response.data;
		} catch (error) {
			if (Axios.isAxiosError(error)) {
				this.emit("error", `Request to ${error.config.url} failed (${error.response?.status}) ${error.response?.statusText}`, `REST`);
			} else {
				//@ts-ignore
				this.emit("error", error.message, `Request Handler`);
			}
		}
	}

	async start(): Promise<void> {
		const {
			url,
			shards,
			session_start_limit: { max_concurrency }
		} = (await this.request(Routes.gatewayBot())) as RESTGetAPIGatewayBotResult;

		this.#shards = new ShardManager(this, {
			url: `${url}/?v=${GatewayVersion}&encoding=json`,
			shards,
			identifyInterval: 5000 / max_concurrency
		});

		this.#shards.start();
	}
}
