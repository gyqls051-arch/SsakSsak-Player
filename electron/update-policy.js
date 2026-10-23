'use strict';
// Only signed Windows NSIS distributions may automatically download/install updates.
const fs = require('node:fs');
const path = require('node:path');
function scalar(text) {
  const value = text.trim();
  if (/^".*"$/.test(value)) { try { return JSON.parse(value); } catch { return ''; } }
  if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
  if (!value || /^(?:null|true|false|~|TODO|REPLACE|CONFIGURE|CHANGEME)$/i.test(value) || /[\[\]{}&*!<>#]/.test(value)) return '';
  return value;
}
function trustedConfig(text, repo) {
  if (typeof text !== 'string' || text.length > 32768) return false;
  const lines = text.split(/\r?\n/);
  const read = key => {
    const found = lines.filter(l => l.startsWith(key + ':'));
    return found.length === 1 ? scalar(found[0].slice(key.length + 1)) : '';
  };
  if (read('provider') !== 'github' || read('owner') !== 'gyqls051-arch' || read('repo') !== repo) return false;
  const entries = lines.filter(l => l.startsWith('publisherName:'));
  if (entries.length !== 1) return false;
  let names = [scalar(entries[0].slice('publisherName:'.length))];
  if (!entries[0].slice('publisherName:'.length).trim()) {
    names = [];
    for (const line of lines.slice(lines.indexOf(entries[0]) + 1)) {
      if (!line.startsWith('  - ')) break;
      names.push(scalar(line.slice(4)));
    }
  }
  return names.length > 0 && names.every(n => typeof n === 'string' && n.trim().length > 1 && !/^(?:TODO|REPLACE|CONFIGURE|CHANGEME|__)/i.test(n));
}
async function startUpdates({app, updater, repo, platform = process.platform,
  readConfig = () => fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8'),
  log = message => console.warn('[updater]', message), schedule = setInterval}) {
  if (!app.isPackaged || !updater || platform !== 'win32') return false;
  try {
    if (!trustedConfig(readConfig(), repo)) {
      log('자동 업데이트 보류: 공식 피드와 서명 게시자가 포함된 설치본이 필요합니다.');
      return false;
    }
  } catch { log('자동 업데이트 설정을 확인하지 못했습니다.'); return false; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.autoRunAppAfterInstall = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  updater.on('error', () => log('업데이트 연결 또는 검증 실패. 앱은 계속 사용할 수 있습니다.'));
  const check = async () => {
    try { await updater.checkForUpdatesAndNotify(); }
    catch { log('업데이트 확인 실패. 다음 실행 또는 주기 확인에서 재시도합니다.'); }
  };
  await check();
  const timer = schedule(check, 6 * 60 * 60 * 1000);
  if (timer.unref) timer.unref();
  app.once('will-quit', () => clearInterval(timer));
  return true;
}
module.exports = {startUpdates, trustedConfig};
