import WebSocket from "ws";
import { GatewayCloseCodes, GatewayOpcodes } from "discord-api-types/v9";

import type { GatewayReceivePayload, RESTGetAPIGatewayBotResult } from "discord-api-types";
import type Client from ".";

const ManualClose = 1000;
const IdkWhatThisCloseCodeMeans = 1006;

export class Shard {
	#sequence: number;
	#session: string;
	#heartbeatACK: boolean;
	#pulse: NodeJS.Timeout | null;
	#lastHeartbeat: number;
	#ws: WebSocket;

	/**Creates a shard */
	constructor(private manager: ShardManager, public id: number) {
		this.#sequence = -1;
		this.#session = "";
		this.#heartbeatACK = false;
		this.#pulse = null;
		this.#lastHeartbeat = -1;
		this.manager.client.emit("debug", `Connecting WS`, this.toString());
		this.#ws = this._createWebsocket();
	}

	connect() {
		this.manager.client.emit("debug", `Connecting WS`, this.toString());
		this.#ws = this._createWebsocket();
	}

	_disconnect(options: { reconnect?: boolean; invalidateSession?: boolean }) {
		this.manager.client.emit("debug", `Disconnecting WS`, this.toString());

		if (this.#ws.readyState == WebSocket.OPEN || this.#ws.readyState == WebSocket.CONNECTING) {
			this.#ws.close(ManualClose, `Manual disconnect`);
		}

		if (this.#pulse) clearInterval(this.#pulse);
		this.#pulse = null;

		if (options?.invalidateSession) {
			this.#sequence = -1;
			this.#session = "";
		}

		if (options?.reconnect) this.connect();
	}

	_createWebsocket() {
		const socket = new WebSocket(this.manager.options.url);
		socket.onopen = () => {
			this.#heartbeatACK = true;
		};
		socket.onmessage = (ev) => this._recieve(JSON.parse(ev.data.toString()));
		socket.onerror = (err) => this.manager.client.emit("error", `WS Error: ${err.toString()}`, this.toString());
		socket.onclose = (ev) => {
			switch (ev.code) {
				case ManualClose: {
					this.manager.client.emit("debug", `WS Close Code ${ev.code}: Manual disconnect`, this.toString());
					break;
				}
				case IdkWhatThisCloseCodeMeans: {
					this.manager.client.emit("debug", `WS Close Code ${ev.code}: Random disconnect, reconnecting`, this.toString());
					this._disconnect({ reconnect: true });
					break;
				}
				case GatewayCloseCodes.UnknownError: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: Unknown error, invalidating session and reconnecting`, this.toString());
					this._disconnect({ reconnect: true, invalidateSession: true });
					break;
				}
				case GatewayCloseCodes.UnknownOpcode: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: Sent invalid opcode, reconnecting`, this.toString());
					this._disconnect({ reconnect: true });
					break;
				}
				case GatewayCloseCodes.DecodeError: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: Sent an invalid payload, reconnecting`, this.toString());
					this._disconnect({ reconnect: true });
					break;
				}
				case GatewayCloseCodes.NotAuthenticated: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: Sent a payload before identifying, invalidating session and reconnecting`, this.toString());
					this._disconnect({ reconnect: true, invalidateSession: true });
					break;
				}
				case GatewayCloseCodes.AuthenticationFailed: {
					this.manager.client.emit("error", `WS Close Code ${ev.code}: Invalid token, invalidating session and NOT reconnecting`, this.toString());
					this._disconnect({ invalidateSession: true });
					break;
				}
				case GatewayCloseCodes.AlreadyAuthenticated: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: Sent more than one identify payload, reconnecting`, this.toString());
					this._disconnect({ reconnect: true });
					break;
				}
				case GatewayCloseCodes.InvalidSeq: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: Invalid sequence number, invalidating session and reconnecting`, this.toString());
					this._disconnect({ reconnect: true, invalidateSession: true });
					break;
				}
				case GatewayCloseCodes.RateLimited: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: Rate limited, reconnecting`, this.toString());
					this._disconnect({ reconnect: true });
					break;
				}
				case GatewayCloseCodes.SessionTimedOut: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: Session timed out, invalidating session and reconnecting`, this.toString());
					this._disconnect({ reconnect: true, invalidateSession: true });
					break;
				}
				case GatewayCloseCodes.InvalidShard: {
					this.manager.client.emit("error", `WS Close Code ${ev.code}: Invalid shard, invalidating session and NOT reconnecting`, this.toString());
					this._disconnect({ invalidateSession: true });
					break;
				}
				case GatewayCloseCodes.ShardingRequired: {
					this.manager.client.emit("error", `WS Close Code ${ev.code}: Sharding required, invalidating session and NOT reconnecting`, this.toString());
					this._disconnect({ invalidateSession: true });
					break;
				}
				case GatewayCloseCodes.InvalidIntents: {
					this.manager.client.emit("error", `WS Close Code ${ev.code}: Invalid intent(s), invalidating session and NOT reconnecting`, this.toString());
					this._disconnect({ invalidateSession: true });
					break;
				}
				case GatewayCloseCodes.DisallowedIntents: {
					this.manager.client.emit("error", `WS Close Code ${ev.code}: Disallowed intent(s), invalidating session and NOT reconnecting`, this.toString());
					this._disconnect({ invalidateSession: true });
					break;
				}
				default: {
					this.manager.client.emit("warn", `WS Close Code ${ev.code}: ${ev.reason}`, this.toString());
					this._disconnect({ reconnect: true, invalidateSession: true });
					break;
				}
			}
		};
		return socket;
	}

	_recieve(payload: GatewayReceivePayload) {
		const { op, s } = payload;
		this.#sequence = s ?? this.#sequence;        

		switch (op) {
			case GatewayOpcodes.Dispatch: {
				this.manager.client.emit("event", payload, this.toString());
				break;
			}
			case GatewayOpcodes.Heartbeat: {
				this.manager.client.emit("debug", `Received heartbeat request, heartbeating`, this.toString());
				this._heartbeat();
				break;
			}
			case GatewayOpcodes.Reconnect: {
				this.manager.client.emit("debug", `Received reconnect request, invalidating session and reconnecting`, this.toString());
				this._disconnect({ reconnect: true, invalidateSession: true });
				break;
			}
			case GatewayOpcodes.InvalidSession: {
				this.manager.client.emit("debug", `Received OP 9, invalidating session and reconnecting`, this.toString());
				this._disconnect({ reconnect: true, invalidateSession: !payload.d });
				break;
			}
			case GatewayOpcodes.Hello: {
				this.manager.client.emit("debug", `Recieved handshake, setting heartbeat interval`, this.toString());
				this.#pulse = setInterval(() => this._heartbeat(true), payload.d.heartbeat_interval);
				if (this.#session) this._resume();
				else this._identify();
				break;
			}
			case GatewayOpcodes.HeartbeatAck:
				this.#heartbeatACK = true;
				this.manager.client.emit("debug", `Heartbeat acknowledged in ${Date.now() - this.#lastHeartbeat}ms`, this.toString());
				break;
			default:
				this.manager.client.emit("warn", `Unknown Packet Received: ${JSON.stringify(payload)}`, this.toString());
				break;
		}
	}

	_heartbeat(pulse = false) {
		if (pulse) {
			if (!this.#heartbeatACK) {
				this.manager.client.emit("warn", `Heartbeat not acknowledged`, this.toString());
				this._disconnect({ reconnect: true, invalidateSession: true });
			}
			this.#heartbeatACK = false;
		}
		this.#lastHeartbeat = Date.now();
		this.manager.client.emit("debug", `Heartbeating sequence ${this.#sequence}`, this.toString());
		this.#ws.send(
			JSON.stringify({
				op: GatewayOpcodes.Heartbeat,
				d: this.#sequence
			})
		);
	}

	_identify() {
		this.manager.client.emit("debug", `Identifying`, this.toString());
		this.#ws.send(
			JSON.stringify({
				op: GatewayOpcodes.Identify,
				d: {
					token: this.manager.client.options.token,
					intents: this.manager.client.options.intents,
					properties: {
						$os: process.platform,
						$browser: "wifubot",
						$device: "wifubot"
					},
					shard: [this.id, this.manager.options.shards]
				}
			})
		);
	}

	_resume() {
		this.manager.client.emit("debug", `Resuming`, this.toString());
		this.#ws.send(
			JSON.stringify({
				op: GatewayOpcodes.Resume,
				d: {
					seq: this.#sequence,
					token: this.manager.client.options.token,
					session_id: this.#session
				}
			})
		);
	}

	toString() {
		return `Shard ${this.id}`;
	}
}

export interface ShardManagerOptions extends Omit<RESTGetAPIGatewayBotResult, "session_start_limit"> {
	/**Time allowed per identify requests */
	identifyInterval: number;
}

export default class ShardManager {
	#shards: Map<number, Shard>;

	constructor(public client: Client, public options: ShardManagerOptions) {
		this.#shards = new Map();
	}

	start(): void {
		for (let i = 0; i < this.options.shards; i++) {
			setTimeout(() => {
				const shard = new Shard(this, i);
				this.#shards.set(i, shard);
			}, i * this.options.identifyInterval);
		}
	}
}
