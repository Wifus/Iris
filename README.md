# Discord Iris

Simple Discord library with no cacheing or voice functions. 

# But WHY???

- Be able to manually cache only what I needed. Big libraries cache lots of things that I just don't need. Slash commands also reduce the amount of data that needs to be cached even further.
- To build a simple library that is specifically made to run on node.
- For myself because I love suffering

# Simple Example Bot

```js
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
```