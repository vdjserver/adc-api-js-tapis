module.exports = {

    // WSO2 Auth Settings
    clientKey:    process.env.WSO2_CLIENT_KEY,
    clientSecret: process.env.WSO2_CLIENT_SECRET,
    hostname:     process.env.WSO2_HOST,

    // VDJ Service Account User
    serviceAccountKey: process.env.VDJ_SERVICE_ACCOUNT,
    serviceAccountSecret: process.env.VDJ_SERVICE_ACCOUNT_SECRET,

    // VDJ Guest Account User
    guestAccountKey: process.env.VDJ_GUEST_ACCOUNT,
    guestAccountSecret: process.env.VDJ_GUEST_ACCOUNT_SECRET,

    // Debug
    debugConsole: process.env.DEBUG_CONSOLE,
};
