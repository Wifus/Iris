// Packages
import Axios, { AxiosRequestHeaders } from "axios";
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
		console.log(`[${new Date().toTimeString().split(" ")[0]}]${src.reduce((acc, cur) => (acc += `[${cur}]`), "")} ${msg}`);
	}

	/**Requests something from the Discord REST API */
	async rest(route: string, method: Method = `GET`, body?: any, files?: File[]) {
		try {
			let data;
			let headers: AxiosRequestHeaders = { Authorization: `Bot ${this.options.token}` };

			if (files) {
				data = new FormData();
				headers = {
					...data.getHeaders(),
					...headers
				};

				if (body) data.append("payload_json", JSON.stringify(body));

				for (const [index, file] of files?.entries() ?? []) {
					data.append(`files[${index}]`, file.data, file.name);
				}
			} else {
				headers["Content-Type"] = "application/json";
			}

			const response = await Axios.request({
				url: `${RouteBases.api}${route}`,
				method,
				headers,
				data: data ?? body
			});

			return response.data;
		} catch (error) {
			if (Axios.isAxiosError(error)) {
				this.emit("error", `Request to ${error.config.url} failed (${error.response?.status}) ${error.response?.statusText}`, `REST`);
			} else {
				//@ts-ignore
				this.emit("error", error.message, `Request Handler`);
			}
			return error;
		}
	}

	async start(): Promise<void> {
		const {
			url,
			shards,
			session_start_limit: { max_concurrency }
		} = (await this.rest(Routes.gatewayBot())) as RESTGetAPIGatewayBotResult;

		this.#shards = new ShardManager(this, {
			url: `${url}/?v=${GatewayVersion}&encoding=json`,
			shards,
			identifyInterval: 5000 / max_concurrency
		});

		this.#shards.start();
	}
}
