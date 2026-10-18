// The Tizen web-application runtime. The subset this service touches is typed
// loosely on purpose: it is the genuine Tizen boundary, and the same global
// name means different things on every Tizen generation.

interface TizenGlobal {
    systeminfo: {
        getCapability(name: string): string;
        getProperties?(names: string[]): Record<string, string>;
        addCapabilityListener?(name: string, callback: () => void): void;
    };
    application: {
        getAppInfo(): { packageId: string; name?: string; version?: string };
        getAppsInfo?(callback: (info: { packageId: string }[]) => void, options?: unknown): void;
        getAppId?(): string;
    };
}

declare const tizen: TizenGlobal;
declare const webapis: Record<string, unknown>;

declare var globalThis: {
    __HOMEBREW_DEV__?: boolean;
};
