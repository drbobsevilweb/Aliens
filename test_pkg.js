import { initRuntimeOverrides, getHudConfig } from './src/settings/missionPackageRuntime.js';

initRuntimeOverrides().then(() => {
    console.dir(getHudConfig());
    console.log("Success");
});
