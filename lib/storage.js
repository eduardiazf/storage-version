const url = require("url");
const { validateHeaderValue } = require("node:http");
const destroy = require("destroy");
const join = require("path").join;
const qs = require("querystring");
const Router = require("routes-router");
const onFinished = require("on-finished");
const morgan = require("morgan");
const finalhandler = require("finalhandler");

const { S3 } = require("@aws-sdk/client-s3");

const logger = morgan(
  ":method :url :status :res[content-length] - :response-time ms"
);

const Storage = function Storage(opts = {}) {
  if (!(this instanceof Storage)) return new Storage(opts);

  const self = this;

  this.handle = Router();
  this.s3 = opts.s3 || new S3({ region: process.env.AWS_REGION || "us-east-1" });
  this.bucket = opts.bucket || process.env.S3_BUCKET || "lotoideal-storage-version";

  this.handle.addRoute("/health", { GET: (req, res) => { res.end("OK"); } });

  this.handle.addRoute("/:parent[(a-z|1-9)]/:name[a-z]", {
    GET: function(req, res) {
      const uri = url.parse(req.url);
      const done = finalhandler(req, res);
      const name = qs.parse(uri.query).name;
      try {
        if (name !== undefined && typeof name !== "string") throw new Error("Invalid file name");
        validateHeaderValue("Content-Disposition", `attachment; filename=${name || "app"}`);
      } catch {
        res.statusCode = 400;
        return res.end("Invalid file name");
      }

      const fn = function(err) {
        if (err) return done(err);

        self.get(res, uri.pathname, name, error => {
          if (error) return done(error);
        });
      };

      logger(req, res, fn);
    }
  });
};

Storage.prototype.get = async function(ws, pathname, name, done) {
  const directory = join.bind(null, pathname);
  const filepath = directory(name || "app");
  let stream;
  try {
    const object = await this.s3.getObject({
      Bucket: this.bucket,
      Key: filepath.substr(1, filepath.length)
    });
    stream = object.Body;
  } catch (error) {
    error.statusCode = error.$metadata?.httpStatusCode || 502;
    return done(error);
  }

  onFinished(ws, function(err) {
    destroy(stream);
  });

  ws.statusCode = 200;

  ws.setHeader("Content-Type", "application/octet-stream");
  ws.setHeader("Content-Disposition", `attachment; filename=${name || "app"}`);

  stream.on("error", error => {
    if (!ws.headersSent) ws.removeHeader("Content-Disposition");
    done(error);
  });

  stream.pipe(ws).on("error", error => {
    done(error);
  });
};

module.exports = Storage;
