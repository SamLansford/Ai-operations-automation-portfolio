export function contentPolicy(isDemoFrame=false) {
 return "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors " + (isDemoFrame ? "'self'" : "'none'") + "; base-uri 'none'; form-action 'self'";
}
