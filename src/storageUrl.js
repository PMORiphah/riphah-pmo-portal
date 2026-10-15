// One place that turns a storage "signedURL" into the address the browser opens.
//
// Supabase returns signedURL relative to the storage API ("/object/sign/<bucket>/<path>?token=…"),
// without the /storage/v1 prefix, so the portal has always concatenated
// SUPA_URL + "/storage/v1" + signedURL (verified against the live bucket: without the prefix → 404).
// For every answer the real storage API gives, the result here is byte-identical to that.
//
// The PMO Simulation's synthetic backend answers sign requests with addresses it can serve itself:
// a blob: link (media handed over at launch) or a same-site path under BASE_URL (its fictional
// documents in public/sim/files). Those are returned unchanged.
const SUPA_URL = "https://prmxkecomqqngvrmytcj.supabase.co";

export function storageUrl(signedURL) {
  if (typeof signedURL === "string") {
    const base = import.meta.env.BASE_URL;
    if (signedURL.startsWith("blob:")) return signedURL;
    if (typeof location !== "undefined" && signedURL.startsWith(location.origin + base)) return signedURL;
    if (signedURL.startsWith(base)) return signedURL;
  }
  return SUPA_URL + "/storage/v1" + signedURL;
}
