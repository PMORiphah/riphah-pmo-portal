// One place that turns a storage "signedURL" into the address the browser opens.
//
// Supabase returns signedURL relative to the storage API ("/object/sign/<bucket>/<path>?token=…"),
// without the /storage/v1 prefix, so the portal has always concatenated
// SUPA_URL + "/storage/v1" + signedURL (verified against the live bucket: without the prefix → 404).
// For every answer the real storage API gives, the result here is byte-identical to that.
//
// The PMO Simulation's synthetic backend answers sign requests for the site-visit media handed over
// at launch with a blob: link, which is returned unchanged. The real storage API never answers with
// a blob: link.
const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";

export function storageUrl(signedURL) {
  if (typeof signedURL === "string" && signedURL.startsWith("blob:")) return signedURL;
  return SUPA_URL + "/storage/v1" + signedURL;
}
