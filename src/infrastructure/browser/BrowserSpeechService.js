export class BrowserSpeechService {
    constructor({ speechSynthesis, SpeechSynthesisUtterance }) {
        this.speechSynthesis = speechSynthesis;
        this.Utterance = SpeechSynthesisUtterance;
        this.enabled = false;
        this.supported = Boolean(speechSynthesis && SpeechSynthesisUtterance);
    }

    setVoiceEnabled(enabled) {
        this.enabled = Boolean(enabled) && this.supported;
        if (!this.enabled) {
            this.speechSynthesis?.cancel?.();
        }
    }

    speak(text, options = {}) {
        if (!this.enabled || !this.supported || !String(text).trim()) {
            return false;
        }
        const utterance = new this.Utterance(String(text));
        utterance.lang = options.lang || 'zh-CN';
        utterance.rate = options.rate ?? 1;
        utterance.pitch = options.pitch ?? 1;
        this.speechSynthesis.speak(utterance);
        return true;
    }
}

export default BrowserSpeechService;
