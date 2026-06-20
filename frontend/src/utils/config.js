export const getBackendUrl = () => {
    return window.location.port === "5173"
        ? `${window.location.protocol}//${window.location.hostname}:5000`
        : window.location.origin;
};
