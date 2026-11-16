// Windows 10+: create the CLI inside an owned job before any of its code runs.
// No command interpreter receives the executable or its arguments.
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.ComponentModel;
using System.Threading;

namespace Savedex {
  public static class NativeJob {
    [StructLayout(LayoutKind.Sequential)] struct Limits {
      public long PerProcess, PerJob; public uint Flags; public UIntPtr MinWS, MaxWS;
      public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong A, B, C, D, E, F; }
    [StructLayout(LayoutKind.Sequential)] struct Extended { public Limits Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob; }
    [StructLayout(LayoutKind.Sequential)] struct Accounting { public long User, Kernel, PeriodUser, PeriodKernel; public uint Faults, Total, Active, Terminated; }
    [StructLayout(LayoutKind.Sequential)] struct Startup {
      public int Size; public IntPtr Reserved, Desktop, Title;
      public uint X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
      public ushort Show, ReservedSize; public IntPtr ReservedBytes, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup Startup; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint Pid, Tid; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attrs, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, ref Extended info, uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int type, out Accounting info, uint length, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string app, StringBuilder command, IntPtr processAttrs, IntPtr threadAttrs, bool inherit, uint flags, IntPtr env, string cwd, ref StartupEx startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static string Quote(string value) {
      StringBuilder b = new StringBuilder("\""); int slashes = 0;
      foreach(char c in value) {
        if(c == '\\') { slashes++; continue; }
        if(c == '"') b.Append('\\', slashes * 2 + 1).Append('"');
        else b.Append('\\', slashes).Append(c);
        slashes = 0;
      }
      return b.Append('\\', slashes * 2).Append('"').ToString();
    }
    static void Clean(IntPtr job) {
      if(!TerminateJobObject(job, 124)) throw new Exception("CLEANUP_FAILED: cannot terminate job", new Win32Exception(Marshal.GetLastWin32Error()));
      Stopwatch timer = Stopwatch.StartNew();
      while(true) {
        Accounting info;
        if(!QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) throw new Exception("CLEANUP_FAILED: cannot inspect job");
        if(info.Active == 0) return;
        if(timer.ElapsedMilliseconds > 5000) throw new Exception("CLEANUP_FAILED: job did not terminate");
        Thread.Sleep(10);
      }
    }
    public static int Run(string executable, string[] arguments, IntPtr owner, int deadlineMs) {
      IntPtr job = IntPtr.Zero, attrs = IntPtr.Zero, jobList = IntPtr.Zero;
      ProcessInfo process = new ProcessInfo(); bool initialized = false, cleaned = false;
      try {
        job = CreateJobObjectW(IntPtr.Zero, null); Check(job != IntPtr.Zero);
        Extended limits = new Extended(); limits.Basic.Flags = 0x2000;
        Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(Extended))));
        IntPtr size = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
        attrs = Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(attrs, 1, 0, ref size)); initialized = true;
        jobList = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobList, job);
        Check(UpdateProcThreadAttribute(attrs, 0, new IntPtr(0x0002000D), jobList, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
        StartupEx startup = new StartupEx(); startup.Startup.Size = Marshal.SizeOf(typeof(StartupEx));
        startup.Startup.Flags = 0x100; startup.Startup.Input = GetStdHandle(-10); startup.Startup.Output = GetStdHandle(-11); startup.Startup.Error = GetStdHandle(-12);
        Check(SetHandleInformation(startup.Startup.Input, 1, 1)); Check(SetHandleInformation(startup.Startup.Output, 1, 1)); Check(SetHandleInformation(startup.Startup.Error, 1, 1));
        startup.Attributes = attrs;
        StringBuilder command = new StringBuilder(Quote(executable)); foreach(string arg in arguments) command.Append(' ').Append(Quote(arg));
        // The owner handle identifies this process instance even if its PID is later reused.
        if(WaitForSingleObject(owner, 0) == 0) return 124;
        Check(CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, true, 0x08080000, IntPtr.Zero, null, ref startup, out process));
        Stopwatch timer = Stopwatch.StartNew();
        while(WaitForSingleObject(process.Process, 50) != 0) {
          if(WaitForSingleObject(owner, 0) == 0 || timer.ElapsedMilliseconds >= deadlineMs) { Clean(job); cleaned = true; return 124; }
        }
        uint result; Check(GetExitCodeProcess(process.Process, out result));
        Clean(job); cleaned = true; return unchecked((int)result);
      } finally {
        try { if(process.Process != IntPtr.Zero && !cleaned) Clean(job); }
        finally { if(job != IntPtr.Zero) CloseHandle(job); }
        if(process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
        if(process.Process != IntPtr.Zero) CloseHandle(process.Process);
        if(initialized) DeleteProcThreadAttributeList(attrs);
        if(attrs != IntPtr.Zero) Marshal.FreeHGlobal(attrs);
        if(jobList != IntPtr.Zero) Marshal.FreeHGlobal(jobList);
      }
    }
  }
}
