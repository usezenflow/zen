// lms.dlu.edu.vn serves its certificate without the Sectigo intermediate (the backend ships it as certs/lms-ca.pem).
// iOS fetches a missing intermediate itself; Android does not, so every LMS request fails the TLS check there.
// Trust that one CA for that one host, on top of the system roots.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

// E2E builds (E2E=1) talk plain http to the campus mock on the host (pnpm mock): the emulator's host alias and localhost only.
const E2E = process.env.E2E ? `
  <domain-config cleartextTrafficPermitted="true">
    <domain>10.0.2.2</domain>
    <domain>localhost</domain>
  </domain-config>` : "";

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>${E2E}
  <domain-config>
    <domain includeSubdomains="true">lms.dlu.edu.vn</domain>
    <trust-anchors>
      <certificates src="system" />
      <certificates src="@raw/lms_ca" />
    </trust-anchors>
  </domain-config>
</network-security-config>
`;

module.exports = (config) => {
  config = withDangerousMod(config, ["android", (c) => {
    const res = path.join(c.modRequest.platformProjectRoot, "app/src/main/res");
    fs.mkdirSync(path.join(res, "raw"), { recursive: true });
    fs.mkdirSync(path.join(res, "xml"), { recursive: true });
    fs.copyFileSync(path.join(__dirname, "lms-ca.pem"), path.join(res, "raw/lms_ca.pem"));
    fs.writeFileSync(path.join(res, "xml/network_security_config.xml"), XML);
    return c;
  }]);
  return withAndroidManifest(config, (c) => {
    c.modResults.manifest.application[0].$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return c;
  });
};
