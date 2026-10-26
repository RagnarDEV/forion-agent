import { json } from "../lib/http.js";
import { errorMessage, errorStatus } from "../lib/errors.js";
import { listRepos } from "../lib/github.js";
import { cleanSecret } from "../lib/security.js";
import { DEFAULT_MODEL } from "../config.js";

export async function handleRepos(request, env) {
  try {
    return json({
      repos: await listRepos(env),
      model: cleanSecret(env.MODEL) || DEFAULT_MODEL
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, errorStatus(error));
  }
}
