//@ts-check
import Client from "discord-iris";
import Auth from "./auth.json";

const Bot = new Client({ token: Auth.token });

Bot.on("debug", (msg, src) => {
    if (msg.startsWith("Heartbeat")) return;
    Bot.log(msg, `DEBUG`, src);
});

Bot.on("warn", (msg, src) => {
    Bot.log(msg, `WARN`, src);
});

Bot.on("error", (err, src) => {
    Bot.log(err, `ERROR`, src);
});

Bot.on("event", (ev, src) => {
    Bot.log(ev.t, `EVENT`, src);
});

Bot.start();