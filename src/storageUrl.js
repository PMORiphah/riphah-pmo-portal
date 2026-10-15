// One place that turns a storage "signedURL" into the address the browser opens.
//
// Supabase returns signedURL relative to the storage API ("/object/sign/<bucket>/<path>?token=…"),
// without the /storage/v1 prefix, so the portal has always concatenated
// SUPA_URL + "/storage/v1" + signedURL (verified against the live bucket: without the prefix → 404).
// For every answer the real storage API gives, the result here is byte-identical to that.
//
// The PMO Simulation's synthetic backend answers sign requests with addresses it can serve itself:
// a blob: link (media handed over at launch) or a same-site path under BASE_URL + "sim/" (its
// fictional documents in public/sim/files). Those are returned unchanged. The check is on
// BASE_URL + "sim/", not BASE_URL alone: under the dev server BASE_URL is "/", which every real
// signedURL also starts with.
const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";

export function storageUrl(signedURL) {
  if (typeof signedURL === "string") {
    const sim = (import.meta.env.BASE_URL || "/") + "sim/";
    if (signedURL.startsWith("blob:")) return signedURL;
    if (signedURL.startsWith(sim)) return signedURL;
    if (typeof location !== "undefined" && signedURL.startsWith(location.origin + sim)) return signedURL;
  }
  return SUPA_URL + "/storage/v1" + signedURL;
}
