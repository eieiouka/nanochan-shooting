class AudioMixer {
  constructor() {
    this.bgm = null;
    this.masterVolume = 1;
    this.bgmVolume = 0.82;
    this.seVolume = 0.8;
  }

  playBgm(src) {
    if (this.bgm && this.bgm.src.includes(src)) {
      this.bgm.play().catch(() => {});
      return;
    }

    this.stopBgm();

    this.bgm = new Audio(src);
    this.bgm.loop = true;
    this.bgm.volume = this.masterVolume * this.bgmVolume;
    this.bgm.play().catch(() => {});
  }

  stopBgm() {
    if (!this.bgm) return;

    this.bgm.pause();
    this.bgm.currentTime = 0;
    this.bgm = null;
  }

  playSe(src) {
    const se = new Audio(src);
    se.volume = this.masterVolume * this.seVolume;
    se.play().catch(() => {});
  }

  setMasterVolume(volume) {
    this.masterVolume = volume;
    if (this.bgm) {
      this.bgm.volume = this.masterVolume * this.bgmVolume;
    }
  }

  setBgmVolume(volume) {
    this.bgmVolume = volume;
    if (this.bgm) {
      this.bgm.volume = this.masterVolume * this.bgmVolume;
    }
  }

  setSeVolume(volume) {
    this.seVolume = volume;
  }
}

export const audioMixer = new AudioMixer();