export const getBackendUrl = () => {
    return window.location.hostname === "localhost" && window.location.port === "5173"
        ? "http://localhost:5000"
        : window.location.origin;
};
