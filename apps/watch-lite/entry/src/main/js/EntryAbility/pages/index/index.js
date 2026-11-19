import device from '@system.device';

const tracks = [
  { title: '夜行电台', duration: 188 },
  { title: '海风来信', duration: 212 },
  { title: '雨后的街道', duration: 176 }
];

function formatTime(seconds) {
  const remainder = seconds % 60;
  return Math.floor(seconds / 60) + ':' + (remainder < 10 ? '0' : '') + remainder;
}

export default {
  data: {
    contentWidth: '312px',
    demo: false,
    index: 0,
    title: tracks[0].title,
    elapsed: 0,
    total: tracks[0].duration,
    timeLabel: '',
    playbackLabel: '播放',
    progressWidth: '0%',
    timer: -1
  },

  onShow() {
    device.getInfo({
      success: (info) => {
        if (info.screenShape === 'rect') {
          this.contentWidth = '352px';
        } else if (info.screenShape === 'circle') {
          this.contentWidth = '312px';
        }
      }
    });
  },

  onHide() {
    this.stopDemoClock();
  },

  onDestroy() {
    this.stopDemoClock();
  },

  toggleDemo() {
    this.stopDemoClock();
    this.selectTrack(0);
    this.demo = !this.demo;
  },

  selectTrack(index) {
    this.index = index;
    this.title = tracks[index].title;
    this.elapsed = 0;
    this.total = tracks[index].duration;
    this.updateProgress();
  },

  previous() {
    this.selectTrack((this.index - 1 + tracks.length) % tracks.length);
  },

  next() {
    this.selectTrack((this.index + 1) % tracks.length);
  },

  togglePlayback() {
    if (this.timer !== -1) {
      this.stopDemoClock();
      return;
    }
    this.playbackLabel = '暂停';
    this.timer = setInterval(() => {
      this.elapsed++;
      if (this.elapsed >= this.total) {
        this.next();
      } else {
        this.updateProgress();
      }
    }, 1000);
  },

  stopDemoClock() {
    if (this.timer !== -1) {
      clearInterval(this.timer);
      this.timer = -1;
    }
    this.playbackLabel = '播放';
  },

  updateProgress() {
    this.progressWidth = Math.floor(this.elapsed * 100 / this.total) + '%';
    this.timeLabel = formatTime(this.elapsed) + ' / ' + formatTime(this.total);
  }
};
