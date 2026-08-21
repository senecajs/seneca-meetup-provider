type MeetupProviderOptions = {
    sdk?: Record<string, any>;
    test?: boolean;
    testopts?: Record<string, any>;
};
declare function MeetupProvider(this: any, options: MeetupProviderOptions): {
    exports: {
        sdk: () => any;
    };
};
export default MeetupProvider;
