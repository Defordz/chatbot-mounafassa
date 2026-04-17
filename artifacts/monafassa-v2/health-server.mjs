import { createServer } from "http";

const port = parseInt(process.env.PORT || "5000", 10);

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Monafassa health server listening on port ${port}`);
});
