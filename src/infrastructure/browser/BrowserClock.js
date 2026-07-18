export class BrowserClock {
    now() {
        return new Date().toISOString();
    }
}

export default BrowserClock;
