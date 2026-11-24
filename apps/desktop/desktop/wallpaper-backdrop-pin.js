'use strict';

const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

function resolveWindowsPowerShellPath() {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function nativeWindowHandleDecimal(win) {
  const handle = win.getNativeWindowHandle();
  if (!Buffer.isBuffer(handle) || handle.length < 4) throw new Error('WALLPAPER_NATIVE_HANDLE_INVALID');
  if (handle.length >= 8 && (process.arch === 'x64' || process.arch === 'arm64')) {
    return handle.readBigUInt64LE(0).toString();
  }
  return String(handle.readUInt32LE(0));
}

function buildWallpaperPinHostScript(input) {
  const hwnd = String(input.hwnd || '');
  if (!/^\d+$/.test(hwnd)) throw new Error('WALLPAPER_NATIVE_HANDLE_INVALID');
  const parentPid = Math.max(0, Math.round(Number(input.parentPid) || 0));
  const x = Math.round(Number(input.x) || 0);
  const y = Math.round(Number(input.y) || 0);
  const width = Math.max(1, Math.round(Number(input.width) || 1));
  const height = Math.max(1, Math.round(Number(input.height) || 1));

  return `
$ErrorActionPreference = "Stop"
if (-not ("LxMineWallpaperPinHost" -as [type])) {
Add-Type @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class LxMineWallpaperPinHost {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
  [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool ScreenToClient(IntPtr hWnd, ref POINT pt);
  [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll", SetLastError=true)] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW", SetLastError=true)] private static extern IntPtr GetWindowLong32(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
  [DllImport("user32.dll", EntryPoint="SetWindowLongW", SetLastError=true)] private static extern IntPtr SetWindowLong32(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetLayeredWindowAttributes(IntPtr hWnd, uint crKey, byte bAlpha, uint dwFlags);
  [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("user32.dll")] private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool TranslateMessage(ref MSG lpMsg);
  [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref MSG lpMsg);
  [DllImport("user32.dll", SetLastError=true)] private static extern UIntPtr SetTimer(IntPtr hWnd, UIntPtr nIDEvent, uint uElapse, IntPtr lpTimerFunc);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool KillTimer(IntPtr hWnd, UIntPtr nIDEvent);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool PostThreadMessage(uint idThread, uint Msg, UIntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll", SetLastError=true)] private static extern IntPtr OpenProcess(uint dwDesiredAccess, [MarshalAs(UnmanagedType.Bool)] bool bInheritHandle, uint dwProcessId);
  [DllImport("kernel32.dll", SetLastError=true)] private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseHandle(IntPtr hObject);
  [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr hwnd, int dwAttribute, ref int pvAttribute, int cbAttribute);

  private static IntPtr GetWindowLongPtr(IntPtr h, int idx) { return IntPtr.Size == 8 ? GetWindowLongPtr64(h, idx) : GetWindowLong32(h, idx); }
  private static IntPtr SetWindowLongPtr(IntPtr h, int idx, IntPtr v) { return IntPtr.Size == 8 ? SetWindowLongPtr64(h, idx, v) : SetWindowLong32(h, idx, v); }

  private const uint WM_QUIT = 0x0012;
  private const uint WM_TIMER = 0x0113;
  private const uint WM_APP_BOUNDS = 0x8002;
  private const uint GW_HWNDNEXT = 2;
  private const uint GW_CHILD = 5;
  private const uint SWP_NOSIZE = 0x0001;
  private const uint SWP_NOMOVE = 0x0002;
  private const uint SWP_NOZORDER = 0x0004;
  private const uint SWP_NOACTIVATE = 0x0010;
  private const uint SWP_FRAMECHANGED = 0x0020;
  private const uint SWP_SHOWWINDOW = 0x0040;
  private const uint SWP_NOOWNERZORDER = 0x0200;
  private const int SW_HIDE = 0;
  private const int GWL_STYLE = -16;
  private const int GWL_EXSTYLE = -20;
  private const long WS_POPUP = 0x80000000L;
  private const long WS_CHILD = 0x40000000L;
  private const long WS_VISIBLE = 0x10000000L;
  private const long WS_CLIPSIBLINGS = 0x04000000L;
  private const long WS_CLIPCHILDREN = 0x02000000L;
  private const long WS_FRAME_BITS = 0x00CF0000L;
  private const long WS_EX_TRANSPARENT = 0x00000020L;
  private const long WS_EX_TOOLWINDOW = 0x00000080L;
  private const long WS_EX_TOPMOST = 0x00000008L;
  private const long WS_EX_APPWINDOW = 0x00040000L;
  private const long WS_EX_LAYERED = 0x00080000L;
  private const long WS_EX_NOACTIVATE = 0x08000000L;
  private const uint LWA_ALPHA = 0x00000002;
  private const int DWMWA_TRANSITIONS_FORCEDISABLED = 3;
  private const int DWMWA_EXCLUDED_FROM_PEEK = 12;

  private static IntPtr _target = IntPtr.Zero;
  private static IntPtr _hostParent = IntPtr.Zero;
  private static IntPtr _shellDefView = IntPtr.Zero;
  private static IntPtr _weBlockedHwnd = IntPtr.Zero;
  private static bool _useProgmanRaised = false;
  private static bool _attachedToWeOverlay = false;
  private static string _activeMode = "progman-raised-dcomp-child";
  private static int _parentPid = 0;
  private static IntPtr _parentSyncHandle = IntPtr.Zero;
  private const uint SYNCHRONIZE_ACCESS = 0x00100000;
  private const uint WAIT_TIMEOUT_RESULT = 0x00000102;
  private static int _physX = 0, _physY = 0, _physW = 1, _physH = 1;
  private static uint _mainTid = 0;
  private static volatile bool _stopping = false;
  private static int _zFightCount = 0;
  private static long _zFightWindowStartMs = 0;
  private static readonly object _boundsLock = new object();
  private static readonly Dictionary<uint, string> _procNameCache = new Dictionary<uint, string>();

  private static string ClassNameOf(IntPtr h) {
    if (h == IntPtr.Zero) return "";
    var cn = new StringBuilder(128);
    GetClassName(h, cn, cn.Capacity);
    return cn.ToString();
  }

  private static string ProcessNameOf(IntPtr h) {
    try {
      uint pid = 0;
      GetWindowThreadProcessId(h, out pid);
      if (pid == 0) return "";
      string cached;
      if (_procNameCache.TryGetValue(pid, out cached)) return cached;
      if (_procNameCache.Count > 256) _procNameCache.Clear();
      string name = "";
      try {
        using (Process p = Process.GetProcessById((int)pid)) {
          name = p.ProcessName ?? "";
        }
      } catch { name = ""; }
      _procNameCache[pid] = name;
      return name;
    } catch { return ""; }
  }

  private static bool IsExternalWallpaperEngineProcess(string proc) {
    if (string.IsNullOrEmpty(proc)) return false;
    if (proc.IndexOf("wallpaperservice", StringComparison.OrdinalIgnoreCase) >= 0) return false;
    if (proc.IndexOf("wallpaper64", StringComparison.OrdinalIgnoreCase) >= 0 ||
        proc.IndexOf("wallpaper32", StringComparison.OrdinalIgnoreCase) >= 0 ||
        proc.IndexOf("ui32", StringComparison.OrdinalIgnoreCase) >= 0 ||
        proc.IndexOf("lively", StringComparison.OrdinalIgnoreCase) >= 0) {
      return true;
    }
    return proc.IndexOf("wallpaper", StringComparison.OrdinalIgnoreCase) >= 0;
  }

  private static bool IsWallpaperBoundaryChild(IntPtr child) {
    string cls = ClassNameOf(child);
    if (string.Equals(cls, "WorkerW", StringComparison.OrdinalIgnoreCase)) return true;
    return IsExternalWallpaperEngineProcess(ProcessNameOf(child));
  }

  private static bool CoversMonitor(IntPtr h, int mx, int my, int mw, int mh) {
    RECT r;
    if (!GetWindowRect(h, out r)) return false;
    int ovL = Math.Max(r.Left, mx);
    int ovT = Math.Max(r.Top, my);
    int ovR = Math.Min(r.Right, mx + mw);
    int ovB = Math.Min(r.Bottom, my + mh);
    int ovW = Math.Max(0, ovR - ovL);
    int ovH = Math.Max(0, ovB - ovT);
    return ovW >= (int)(mw * 0.55) && ovH >= (int)(mh * 0.55);
  }

  private static IntPtr ScanChildrenForWallpaperHost(IntPtr parent, int mx, int my, int mw, int mh, int depth) {
    if (parent == IntPtr.Zero || depth > 2) return IntPtr.Zero;
    IntPtr child = GetWindow(parent, GW_CHILD);
    int guard = 0;
    while (child != IntPtr.Zero && guard++ < 128) {
      if (child != _target && IsWindowVisible(child)) {
        string cls = ClassNameOf(child);
        if (!string.Equals(cls, "SHELLDLL_DefView", StringComparison.OrdinalIgnoreCase)) {
          string proc = ProcessNameOf(child);
          if (IsExternalWallpaperEngineProcess(proc) && CoversMonitor(child, mx, my, mw, mh)) {
            return child;
          }
          if (string.Equals(cls, "WorkerW", StringComparison.OrdinalIgnoreCase)) {
            IntPtr nested = ScanChildrenForWallpaperHost(child, mx, my, mw, mh, depth + 1);
            if (nested != IntPtr.Zero) return nested;
          }
        }
      }
      child = GetWindow(child, GW_HWNDNEXT);
    }
    return IntPtr.Zero;
  }

  private static IntPtr FindActiveWallpaperEngineHost(IntPtr progman, IntPtr classicWorkerW, int mx, int my, int mw, int mh) {
    // 1. Check Progman direct children & Progman->WorkerW grandchildren (Win11 24H2/25H2 Raised Desktop)
    IntPtr found = ScanChildrenForWallpaperHost(progman, mx, my, mw, mh, 0);
    if (found != IntPtr.Zero) return found;
    // 2. Check classic sibling WorkerW if present (Win10 / Win11 23H2)
    if (classicWorkerW != IntPtr.Zero && classicWorkerW != progman) {
      found = ScanChildrenForWallpaperHost(classicWorkerW, mx, my, mw, mh, 0);
      if (found != IntPtr.Zero) return found;
    }
    return IntPtr.Zero;
  }

  private static bool ParentAlive() {
    if (_parentPid <= 0) return true;
    if (_parentSyncHandle != IntPtr.Zero) {
      return WaitForSingleObject(_parentSyncHandle, 0) == WAIT_TIMEOUT_RESULT;
    }
    try {
      using (Process p = Process.GetProcessById(_parentPid)) {
        return !p.HasExited;
      }
    } catch { return false; }
  }

  private static void ResolveFullMonitorBounds(ref int x, ref int y, ref int w, ref int h) {
    try {
      POINT pt = new POINT { X = x + 16, Y = y + 16 };
      IntPtr hMon = MonitorFromPoint(pt, 2);
      if (hMon != IntPtr.Zero) {
        MONITORINFO mi = new MONITORINFO();
        mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (GetMonitorInfo(hMon, ref mi)) {
          int monW = mi.rcMonitor.Right - mi.rcMonitor.Left;
          int monH = mi.rcMonitor.Bottom - mi.rcMonitor.Top;
          if (monW >= 320 && monH >= 240) {
            x = mi.rcMonitor.Left;
            y = mi.rcMonitor.Top;
            w = monW;
            h = monH;
          }
        }
      }
    } catch { }
  }

  private static bool ResolveBaseDesktopHost(out IntPtr progmanOut, out IntPtr baseHost, out IntPtr shellDefView, out bool useProgmanRaised) {
    progmanOut = IntPtr.Zero;
    baseHost = IntPtr.Zero;
    shellDefView = IntPtr.Zero;
    useProgmanRaised = false;

    IntPtr progman = FindWindow("Progman", null);
    if (progman == IntPtr.Zero) return false;
    progmanOut = progman;

    // Windows 11 24H2 / 25H2 (26100/26200/26300) Raised Desktop:
    // SHELLDLL_DefView is ALREADY a direct child of Progman. NEVER send 0x052C here!
    IntPtr progmanShell = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
    if (progmanShell != IntPtr.Zero) {
      baseHost = progman;
      shellDefView = progmanShell;
      useProgmanRaised = true;
      return true;
    }

    // Classic Windows 10 / Windows 11 23H2 sibling WorkerW behind SHELLDLL_DefView.
    IntPtr foundWorker = IntPtr.Zero;
    IntPtr foundShell = IntPtr.Zero;
    Action findClassic = delegate() {
      foundWorker = IntPtr.Zero;
      foundShell = IntPtr.Zero;
      EnumWindows(delegate(IntPtr top, IntPtr lp) {
        IntPtr view = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (view != IntPtr.Zero) {
          foundShell = view;
          IntPtr candidate = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
          if (candidate != IntPtr.Zero) foundWorker = candidate;
          return false;
        }
        return true;
      }, IntPtr.Zero);
      if (foundWorker == IntPtr.Zero) {
        IntPtr childWorker = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        if (childWorker != IntPtr.Zero) foundWorker = childWorker;
      }
    };

    findClassic();
    if (foundWorker == IntPtr.Zero) {
      IntPtr sendRes;
      SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1000, out sendRes);
      findClassic();
      if (foundWorker == IntPtr.Zero) {
        IntPtr retryShell = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (retryShell != IntPtr.Zero) {
          baseHost = progman;
          shellDefView = retryShell;
          useProgmanRaised = true;
          return true;
        }
      }
    }

    if (foundWorker != IntPtr.Zero) {
      baseHost = foundWorker;
      shellDefView = foundShell;
      useProgmanRaised = false;
      return true;
    }
    return false;
  }

  private static IntPtr FindSafeProgmanInsertAfter(IntPtr progman, IntPtr shellDefView, IntPtr selfHwnd, out bool alreadyInExactSlot) {
    IntPtr insertAfter = shellDefView;
    bool seenTarget = false;
    bool widgetOrIconBelowTarget = false;
    bool targetBelowWallpaperBoundary = false;
    bool hitWallpaperBoundary = false;

    IntPtr child = GetWindow(progman, GW_CHILD);
    int guard = 0;
    while (child != IntPtr.Zero && guard++ < 256) {
      if (child == selfHwnd) {
        seenTarget = true;
        if (hitWallpaperBoundary) targetBelowWallpaperBoundary = true;
      } else if (!hitWallpaperBoundary) {
        if (IsWallpaperBoundaryChild(child)) {
          hitWallpaperBoundary = true;
        } else if (child == shellDefView || IsWindowVisible(child)) {
          insertAfter = child;
          if (seenTarget) widgetOrIconBelowTarget = true;
        }
      }
      child = GetWindow(child, GW_HWNDNEXT);
    }

    alreadyInExactSlot = seenTarget && !widgetOrIconBelowTarget && !targetBelowWallpaperBoundary;
    return insertAfter;
  }

  private static void ApplyDesktopChildStyle(IntPtr target, bool requireLayered) {
    long style = GetWindowLongPtr(target, GWL_STYLE).ToInt64();
    long nextStyle = (style & ~(WS_POPUP | WS_FRAME_BITS)) | WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN | WS_VISIBLE;
    if (nextStyle != style) SetWindowLongPtr(target, GWL_STYLE, new IntPtr(nextStyle));

    // Preserve Electron's native WS_EX_NOREDIRECTIONBITMAP (0x00200000) for DirectComposition per-pixel alpha!
    long ex = GetWindowLongPtr(target, GWL_EXSTYLE).ToInt64();
    long layeredBit = requireLayered ? WS_EX_LAYERED : 0L;
    long nextEx = (ex & ~(WS_EX_APPWINDOW | WS_EX_TOPMOST)) | layeredBit | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT;
    if (nextEx != ex) SetWindowLongPtr(target, GWL_EXSTYLE, new IntPtr(nextEx));

    if (requireLayered) {
      SetLayeredWindowAttributes(target, 0, 255, LWA_ALPHA);
    }

    int one = 1;
    try { DwmSetWindowAttribute(target, DWMWA_EXCLUDED_FROM_PEEK, ref one, 4); } catch { }
    try { DwmSetWindowAttribute(target, DWMWA_TRANSITIONS_FORCEDISABLED, ref one, 4); } catch { }
  }

  private static bool AttachOrVerify(bool forceApply) {
    if (_stopping || !IsWindow(_target)) {
      PostThreadMessage(_mainTid, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
      return false;
    }

    int x, y, w, h;
    lock (_boundsLock) { x = _physX; y = _physY; w = _physW; h = _physH; }

    IntPtr progman, baseHost, shellDefView;
    bool useProgmanRaised;
    if (!ResolveBaseDesktopHost(out progman, out baseHost, out shellDefView, out useProgmanRaised)) {
      return false;
    }

    // Tier 1 (Wallpaper Engine Coexistence):
    // When Wallpaper Engine (wallpaper64/32) or Lively is active on this monitor, attach LxMine
    // DIRECTLY AS A CHILD OF WALLPAPER ENGINE'S OWN RENDER HWND at HWND_TOP!
    // That leaves Progman's child list 100% untouched so Wallpaper Engine NEVER fights Z-order,
    // while LxMine renders per-pixel transparent ABOVE Wallpaper Engine and strictly BELOW
    // desktop icons (SHELLDLL_DefView), DeskBox, and the translucent taskbar!
    IntPtr weHost = FindActiveWallpaperEngineHost(progman, useProgmanRaised ? IntPtr.Zero : baseHost, x, y, w, h);
    if (weHost == IntPtr.Zero) {
      _weBlockedHwnd = IntPtr.Zero;
    }

    IntPtr desiredParent = baseHost;
    bool desiredWeOverlay = false;
    if (weHost != IntPtr.Zero && weHost != _weBlockedHwnd && IsWindow(weHost) && IsWindowVisible(weHost)) {
      desiredParent = weHost;
      desiredWeOverlay = true;
    }

    if (desiredParent != _hostParent || desiredWeOverlay != _attachedToWeOverlay) {
      forceApply = true;
    }

    bool parentMatches = GetParent(_target) == desiredParent;
    bool visible = IsWindowVisible(_target) && !IsIconic(_target);
    bool boundsOk = false;
    RECT tr;
    if (GetWindowRect(_target, out tr)) {
      boundsOk = Math.Abs(tr.Left - x) <= 2 && Math.Abs(tr.Top - y) <= 2 &&
                 Math.Abs((tr.Right - tr.Left) - w) <= 2 && Math.Abs((tr.Bottom - tr.Top) - h) <= 2;
    }

    IntPtr insertAfter = IntPtr.Zero;
    bool slotOk = false;
    if (desiredWeOverlay) {
      IntPtr firstChild = GetWindow(desiredParent, GW_CHILD);
      slotOk = (firstChild == _target);
      insertAfter = IntPtr.Zero; // HWND_TOP inside Wallpaper Engine's canvas
    } else if (useProgmanRaised && shellDefView != IntPtr.Zero) {
      insertAfter = FindSafeProgmanInsertAfter(desiredParent, shellDefView, _target, out slotOk);
    } else {
      IntPtr firstChild = GetWindow(desiredParent, GW_CHILD);
      slotOk = (firstChild == _target);
      insertAfter = IntPtr.Zero; // HWND_TOP inside classic sibling WorkerW
    }

    // Already in exact parent, visible, bounds & Z-order slot -> 0 Win32 calls, 0 flicker!
    if (!forceApply && parentMatches && visible && boundsOk && slotOk) {
      return true;
    }

    // Anti-fight backoff if UIPI blocked WE nesting and WE keeps stealing Progman Z-order.
    if (!forceApply && parentMatches && !desiredWeOverlay && !slotOk && weHost != IntPtr.Zero) {
      long nowMs = Environment.TickCount & 0x7FFFFFFF;
      if (_zFightWindowStartMs == 0 || (nowMs - _zFightWindowStartMs) > 12000) {
        _zFightWindowStartMs = nowMs;
        _zFightCount = 1;
      } else {
        _zFightCount++;
        if (_zFightCount >= 4) {
          // Stop fighting to avoid rapid flicker when external wallpaper runs elevated.
          return true;
        }
      }
    }

    bool requireLayered = desiredWeOverlay || useProgmanRaised;
    if (!parentMatches || forceApply) {
      ApplyDesktopChildStyle(_target, requireLayered);
      if (!parentMatches) {
        SetParent(_target, desiredParent);
        if (GetParent(_target) != desiredParent) {
          if (desiredWeOverlay) {
            // UIPI blocked SetParent into an elevated wallpaper64.exe; fall back cleanly to Explorer's WorkerW/Progman.
            _weBlockedHwnd = weHost;
            IntPtr weParent = GetParent(weHost);
            if (weParent != IntPtr.Zero && weParent != progman &&
                string.Equals(ClassNameOf(weParent), "WorkerW", StringComparison.OrdinalIgnoreCase)) {
              desiredParent = weParent;
              desiredWeOverlay = false;
              useProgmanRaised = false;
            } else {
              desiredParent = baseHost;
              desiredWeOverlay = false;
            }
            ApplyDesktopChildStyle(_target, useProgmanRaised);
            SetParent(_target, desiredParent);
            if (GetParent(_target) != desiredParent) return false;
          } else {
            return false;
          }
        }
      }
      if (desiredWeOverlay) {
        insertAfter = IntPtr.Zero;
      } else if (useProgmanRaised && shellDefView != IntPtr.Zero) {
        insertAfter = FindSafeProgmanInsertAfter(desiredParent, shellDefView, _target, out slotOk);
      } else {
        insertAfter = IntPtr.Zero;
      }
    }

    _hostParent = desiredParent;
    _shellDefView = shellDefView;
    _useProgmanRaised = useProgmanRaised;
    _attachedToWeOverlay = desiredWeOverlay;
    _activeMode = desiredWeOverlay
      ? "we-overlay-child"
      : (useProgmanRaised ? "progman-raised-dcomp-child" : "workerw-classic-child");

    POINT origin = new POINT { X = x, Y = y };
    if (!ScreenToClient(desiredParent, ref origin)) return false;

    uint flags = SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOOWNERZORDER;
    if (!parentMatches || forceApply) flags |= SWP_FRAMECHANGED;
    if (!forceApply && parentMatches && boundsOk) flags |= SWP_NOMOVE | SWP_NOSIZE;
    if (!forceApply && parentMatches && slotOk) flags |= SWP_NOZORDER;

    return SetWindowPos(_target, insertAfter, origin.X, origin.Y, w, h, flags);
  }

  private static void DetachCleanlyNoFlash() {
    if (_target == IntPtr.Zero || !IsWindow(_target)) return;
    try {
      ShowWindow(_target, SW_HIDE);
      if (GetParent(_target) != IntPtr.Zero) {
        SetParent(_target, IntPtr.Zero);
      }
      long style = GetWindowLongPtr(_target, GWL_STYLE).ToInt64();
      long restored = (style & ~WS_CHILD) | WS_POPUP;
      if (restored != style) SetWindowLongPtr(_target, GWL_STYLE, new IntPtr(restored));
    } catch { }
  }

  public static int Run(long hwndLong, int parentPid, int x, int y, int w, int h) {
    IntPtr prevDpi = IntPtr.Zero;
    try { prevDpi = SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
    _target = new IntPtr(hwndLong);
    _parentPid = parentPid;
    if (parentPid > 0) {
      try { _parentSyncHandle = OpenProcess(SYNCHRONIZE_ACCESS, false, (uint)parentPid); } catch { _parentSyncHandle = IntPtr.Zero; }
    }
    if (!IsWindow(_target)) {
      if (_parentSyncHandle != IntPtr.Zero) { CloseHandle(_parentSyncHandle); _parentSyncHandle = IntPtr.Zero; }
      Console.WriteLine("{\\"ok\\":false,\\"error\\":\\"WALLPAPER_TARGET_NOT_FOUND\\"}");
      Console.Out.Flush();
      return 2;
    }

    ResolveFullMonitorBounds(ref x, ref y, ref w, ref h);
    lock (_boundsLock) { _physX = x; _physY = y; _physW = w; _physH = h; }
    _mainTid = GetCurrentThreadId();

    if (!AttachOrVerify(true)) {
      if (_parentSyncHandle != IntPtr.Zero) { CloseHandle(_parentSyncHandle); _parentSyncHandle = IntPtr.Zero; }
      Console.WriteLine("{\\"ok\\":false,\\"error\\":\\"WALLPAPER_DESKTOP_ATTACH_FAILED\\"}");
      Console.Out.Flush();
      return 3;
    }

    string parentCls = ClassNameOf(_hostParent);
    Console.WriteLine(string.Format(
      "{{\\"ok\\":true,\\"mode\\":\\"{0}\\",\\"targetWindowId\\":\\"{1}\\",\\"parentWindowId\\":\\"{2}\\",\\"parentClassName\\":\\"{3}\\",\\"x\\":{4},\\"y\\":{5},\\"width\\":{6},\\"height\\":{7}}}",
      _activeMode, _target.ToInt64(), _hostParent.ToInt64(), parentCls, x, y, w, h
    ));
    Console.Out.Flush();

    Thread stdinThread = new Thread(delegate() {
      try {
        string line;
        while ((line = Console.ReadLine()) != null) {
          string trimmed = line.Trim();
          if (trimmed.Equals("stop", StringComparison.OrdinalIgnoreCase)) {
            _stopping = true;
            PostThreadMessage(_mainTid, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
            break;
          }
          if (trimmed.StartsWith("reposition ", StringComparison.OrdinalIgnoreCase)) {
            string[] parts = trimmed.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 5) {
              int nx, ny, nw, nh;
              if (int.TryParse(parts[1], out nx) && int.TryParse(parts[2], out ny) &&
                  int.TryParse(parts[3], out nw) && int.TryParse(parts[4], out nh)) {
                ResolveFullMonitorBounds(ref nx, ref ny, ref nw, ref nh);
                lock (_boundsLock) { _physX = nx; _physY = ny; _physW = nw; _physH = nh; }
                PostThreadMessage(_mainTid, WM_APP_BOUNDS, UIntPtr.Zero, IntPtr.Zero);
              }
            }
          }
        }
      } catch { }
      _stopping = true;
      PostThreadMessage(_mainTid, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
    });
    stdinThread.IsBackground = true;
    stdinThread.Start();

    // Gentle 1200ms watchdog: zero Win32 calls when already in exact slot; auto-migrates seamlessly
    // whenever Wallpaper Engine is started or exited!
    UIntPtr watchdogTimer = SetTimer(IntPtr.Zero, new UIntPtr(2), 1200, IntPtr.Zero);
    try {
      MSG msg;
      while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
        if (msg.message == WM_TIMER) {
          if (!IsWindow(_target) || !ParentAlive()) {
            break;
          }
          AttachOrVerify(false);
          continue;
        }
        if (msg.message == WM_APP_BOUNDS) {
          AttachOrVerify(true);
          continue;
        }
        TranslateMessage(ref msg);
        DispatchMessage(ref msg);
      }
    } finally {
      if (watchdogTimer != UIntPtr.Zero) KillTimer(IntPtr.Zero, new UIntPtr(2));
      DetachCleanlyNoFlash();
      if (_parentSyncHandle != IntPtr.Zero) {
        try { CloseHandle(_parentSyncHandle); } catch { }
        _parentSyncHandle = IntPtr.Zero;
      }
      if (prevDpi != IntPtr.Zero) { try { SetThreadDpiAwarenessContext(prevDpi); } catch { } }
    }
    return 0;
  }
}
'@
}
[void][LxMineWallpaperPinHost]::Run([Int64]${hwnd}, [int]${parentPid}, [int]${x}, [int]${y}, [int]${width}, [int]${height})
`;
}

function startWallpaperBackdropPin(options = {}) {
  const hwnd = String(options.hwnd || '');
  if (!/^\d+$/.test(hwnd)) return Promise.reject(new Error('WALLPAPER_NATIVE_HANDLE_INVALID'));
  const script = buildWallpaperPinHostScript({
    hwnd,
    parentPid: options.parentPid || process.pid,
    x: options.x || 0,
    y: options.y || 0,
    width: options.width || 1,
    height: options.height || 1,
  });
  const env = { ...process.env };
  const nativeTempPath = String(options.nativeTempPath || '').trim();
  if (nativeTempPath) {
    env.TEMP = nativeTempPath;
    env.TMP = nativeTempPath;
  }
  const timeoutMs = Math.max(2000, Math.min(15000, Number(options.timeoutMs) || 9000));
  const onExit = typeof options.onExit === 'function' ? options.onExit : () => {};

  return new Promise((resolve, reject) => {
    let settled = false;
    let stopped = false;
    let stderrBuf = '';
    const psExe = resolveWindowsPowerShellPath();
    const child = spawn(psExe, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    const controller = {
      pid: child.pid || 0,
      ack: null,
      reposition(bounds) {
        if (stopped || !child.stdin || child.stdin.destroyed) return false;
        const bx = Math.round(Number(bounds && bounds.x) || 0);
        const by = Math.round(Number(bounds && bounds.y) || 0);
        const bw = Math.max(1, Math.round(Number(bounds && bounds.width) || 1));
        const bh = Math.max(1, Math.round(Number(bounds && bounds.height) || 1));
        try {
          child.stdin.write(`reposition ${bx} ${by} ${bw} ${bh}\n`);
          return true;
        } catch (_) {
          return false;
        }
      },
      stop(waitMs = 900) {
        if (stopped) return Promise.resolve();
        stopped = true;
        return new Promise((done) => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(killTimer);
            done();
          };
          child.once('exit', finish);
          try {
            if (child.stdin && !child.stdin.destroyed) {
              child.stdin.write('stop\n');
              child.stdin.end();
            }
          } catch (_) { }
          const killTimer = setTimeout(() => {
            try { child.kill(); } catch (_) { }
            finish();
          }, Math.max(200, Number(waitMs) || 900));
        });
      },
    };

    const readyTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      stopped = true;
      try { child.kill(); } catch (_) { }
      reject(new Error('WALLPAPER_PIN_HOST_TIMEOUT'));
    }, timeoutMs);

    const rl = readline.createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed || settled) return;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && parsed.ok === true) {
          settled = true;
          clearTimeout(readyTimer);
          controller.ack = parsed;
          resolve(controller);
        } else if (parsed && parsed.ok === false) {
          settled = true;
          clearTimeout(readyTimer);
          stopped = true;
          try { child.kill(); } catch (_) { }
          reject(new Error(String(parsed.error || 'WALLPAPER_PIN_HOST_FAILED')));
        }
      } catch (_) { }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += String(chunk || '');
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
    });

    child.on('error', (error) => {
      clearTimeout(readyTimer);
      if (!settled) {
        settled = true;
        reject(error);
      } else if (!stopped) {
        onExit({ reason: 'error', error: String(error && error.message || error) });
      }
    });

    child.on('exit', (code, signal) => {
      clearTimeout(readyTimer);
      try { rl.close(); } catch (_) { }
      if (!settled) {
        settled = true;
        const msg = stderrBuf.trim().split(/\r?\n/)[0] || `WALLPAPER_PIN_HOST_EXITED:${code ?? signal ?? 'unknown'}`;
        reject(new Error(msg));
      } else if (!stopped) {
        onExit({ reason: 'exited', code, signal });
      }
    });
  });
}

module.exports = {
  buildWallpaperPinHostScript,
  nativeWindowHandleDecimal,
  resolveWindowsPowerShellPath,
  startWallpaperBackdropPin,
};
