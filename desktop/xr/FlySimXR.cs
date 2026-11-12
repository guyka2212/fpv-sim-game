// FlySimXR: shows the FPV Sim picture in a VR headset as a head-locked goggle screen.
//
// Electron has no OpenXR, so the app streams its window to this small native program, which
// does what VrFsim's Unity OpenXR plugin does: opens an OpenXR session (Meta Horizon Link or
// any runtime) on the graphics card the runtime asks for, and every frame submits one quad
// layer fixed in front of the eyes, like the screen in real FPV goggles.
//
// Input on stdin, little-endian:
//   "FXRF" width:u32 height:u32 bytes:u32 then width*height*4 bytes of BGRA   (a frame)
//   "FXRC" fovDegrees:f32 distance:f32 reserved:u32                           (screen size)
// Output on stdout: one status line per change, e.g. "STATE focused", "ERROR ...".
//
// Built with the .NET Framework compiler that ships with Windows (build.ps1), so C# 5.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

[assembly: System.Reflection.AssemblyTitle("FPV Sim OpenXR goggles")]
[assembly: System.Reflection.AssemblyVersion("0.1.0.0")]

namespace FlySimXR
{
    static class Xr
    {
        const string Dll = "openxr_loader.dll";

        // Structure types (openxr.h).
        public const int TYPE_INSTANCE_CREATE_INFO = 3, TYPE_SYSTEM_GET_INFO = 4, TYPE_SESSION_CREATE_INFO = 8,
            TYPE_SWAPCHAIN_CREATE_INFO = 9, TYPE_SESSION_BEGIN_INFO = 10, TYPE_FRAME_END_INFO = 12,
            TYPE_EVENT_DATA_BUFFER = 16, TYPE_EVENT_DATA_SESSION_STATE_CHANGED = 18, TYPE_FRAME_WAIT_INFO = 33,
            TYPE_COMPOSITION_LAYER_QUAD = 36, TYPE_REFERENCE_SPACE_CREATE_INFO = 37, TYPE_FRAME_STATE = 44,
            TYPE_FRAME_BEGIN_INFO = 46, TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO = 55, TYPE_SWAPCHAIN_IMAGE_WAIT_INFO = 56,
            TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO = 57, TYPE_GRAPHICS_BINDING_D3D11_KHR = 1000027000,
            TYPE_SWAPCHAIN_IMAGE_D3D11_KHR = 1000027001, TYPE_GRAPHICS_REQUIREMENTS_D3D11_KHR = 1000027002;

        public const int EVENT_UNAVAILABLE = 4;

        [DllImport(Dll)] public static extern int xrCreateInstance(IntPtr info, out ulong instance);
        [DllImport(Dll)] public static extern int xrDestroyInstance(ulong instance);
        [DllImport(Dll)] public static extern int xrGetSystem(ulong instance, IntPtr info, out ulong systemId);
        [DllImport(Dll)] public static extern int xrGetInstanceProcAddr(ulong instance, [MarshalAs(UnmanagedType.LPStr)] string name, out IntPtr fn);
        [DllImport(Dll)] public static extern int xrCreateSession(ulong instance, IntPtr info, out ulong session);
        [DllImport(Dll)] public static extern int xrDestroySession(ulong session);
        [DllImport(Dll)] public static extern int xrBeginSession(ulong session, IntPtr info);
        [DllImport(Dll)] public static extern int xrEndSession(ulong session);
        [DllImport(Dll)] public static extern int xrRequestExitSession(ulong session);
        [DllImport(Dll)] public static extern int xrCreateReferenceSpace(ulong session, IntPtr info, out ulong space);
        [DllImport(Dll)] public static extern int xrEnumerateSwapchainFormats(ulong session, uint cap, out uint count, [Out] long[] formats);
        [DllImport(Dll)] public static extern int xrCreateSwapchain(ulong session, IntPtr info, out ulong swapchain);
        [DllImport(Dll)] public static extern int xrDestroySwapchain(ulong swapchain);
        [DllImport(Dll)] public static extern int xrEnumerateSwapchainImages(ulong swapchain, uint cap, out uint count, IntPtr images);
        [DllImport(Dll)] public static extern int xrAcquireSwapchainImage(ulong swapchain, IntPtr info, out uint index);
        [DllImport(Dll)] public static extern int xrWaitSwapchainImage(ulong swapchain, IntPtr info);
        [DllImport(Dll)] public static extern int xrReleaseSwapchainImage(ulong swapchain, IntPtr info);
        [DllImport(Dll)] public static extern int xrWaitFrame(ulong session, IntPtr info, IntPtr state);
        [DllImport(Dll)] public static extern int xrBeginFrame(ulong session, IntPtr info);
        [DllImport(Dll)] public static extern int xrEndFrame(ulong session, IntPtr info);
        [DllImport(Dll)] public static extern int xrPollEvent(ulong instance, IntPtr eventData);

        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        public delegate int GetD3D11Requirements(ulong instance, ulong systemId, IntPtr requirements);

        public static void Check(int result, string what)
        {
            if (result < 0) throw new XrException(what + " failed (XrResult " + result + ")", result);
        }
    }

    class XrException : Exception
    {
        public readonly int Result;
        public XrException(string m, int r) : base(m) { Result = r; }
    }

    /// Native memory for one OpenXR struct, written at explicit x64 offsets.
    class Mem : IDisposable
    {
        public readonly IntPtr P;
        readonly int size;
        public Mem(int size)
        {
            this.size = size;
            P = Marshal.AllocHGlobal(size);
            for (int i = 0; i < size; i++) Marshal.WriteByte(P, i, 0);
        }
        public Mem I32(int off, int v) { Marshal.WriteInt32(P, off, v); return this; }
        public Mem I64(int off, long v) { Marshal.WriteInt64(P, off, v); return this; }
        public Mem Ptr(int off, IntPtr v) { Marshal.WriteIntPtr(P, off, v); return this; }
        public Mem F32(int off, float v) { Marshal.WriteInt32(P, off, BitConverter.ToInt32(BitConverter.GetBytes(v), 0)); return this; }
        public Mem Str(int off, string s, int max)
        {
            byte[] b = Encoding.UTF8.GetBytes(s);
            for (int i = 0; i < Math.Min(b.Length, max - 1); i++) Marshal.WriteByte(P, off + i, b[i]);
            return this;
        }
        public int RI32(int off) { return Marshal.ReadInt32(P, off); }
        public long RI64(int off) { return Marshal.ReadInt64(P, off); }
        public IntPtr RPtr(int off) { return Marshal.ReadIntPtr(P, off); }
        public void Dispose() { Marshal.FreeHGlobal(P); }
    }

    /// Just enough Direct3D 11 / DXGI through COM vtables: a device on a given adapter and
    /// UpdateSubresource to copy frames into the runtime's swapchain textures.
    static class D3D
    {
        [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid riid, out IntPtr factory);
        [DllImport("d3d11.dll")]
        static extern int D3D11CreateDevice(IntPtr adapter, int driverType, IntPtr software, uint flags, IntPtr levels, uint count,
            uint sdk, out IntPtr device, out int level, out IntPtr context);

        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumAdapters1(IntPtr self, uint i, out IntPtr adapter);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetDesc1(IntPtr self, IntPtr desc);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate uint Release(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        delegate void UpdateSubresource(IntPtr self, IntPtr resource, uint sub, IntPtr box, IntPtr data, uint rowPitch, uint depthPitch);

        static T Method<T>(IntPtr obj, int slot) where T : class
        {
            IntPtr vtbl = Marshal.ReadIntPtr(obj);
            return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vtbl, slot * IntPtr.Size), typeof(T)) as T;
        }

        static void ReleaseCom(IntPtr p) { if (p != IntPtr.Zero) Method<Release>(p, 2)(p); }

        /// Creates the device on the adapter whose LUID the OpenXR runtime asked for.
        public static void CreateDevice(long luid, out IntPtr device, out IntPtr context, out string adapterName)
        {
            Guid iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387"); // IDXGIFactory1
            IntPtr factory;
            Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref iid, out factory));
            IntPtr chosen = IntPtr.Zero;
            adapterName = "default";
            try
            {
                for (uint i = 0; ; i++)
                {
                    IntPtr adapter;
                    if (Method<EnumAdapters1>(factory, 12)(factory, i, out adapter) < 0) break;
                    using (var desc = new Mem(312))
                    {
                        Method<GetDesc1>(adapter, 10)(adapter, desc.P);
                        if (desc.RI64(296) == luid)
                        {
                            chosen = adapter;
                            adapterName = Marshal.PtrToStringUni(desc.P);
                            break;
                        }
                    }
                    ReleaseCom(adapter);
                }
                const uint BGRA_SUPPORT = 0x20;
                int level;
                // With an explicit adapter the driver type must be UNKNOWN (0); otherwise HARDWARE (1).
                Marshal.ThrowExceptionForHR(D3D11CreateDevice(chosen, chosen == IntPtr.Zero ? 1 : 0, IntPtr.Zero, BGRA_SUPPORT,
                    IntPtr.Zero, 0, 7, out device, out level, out context));
            }
            finally
            {
                ReleaseCom(chosen);
                ReleaseCom(factory);
            }
        }

        public static void Upload(IntPtr context, IntPtr texture, byte[] pixels, int width)
        {
            var h = GCHandle.Alloc(pixels, GCHandleType.Pinned);
            try { Method<UpdateSubresource>(context, 48)(context, texture, 0, IntPtr.Zero, h.AddrOfPinnedObject(), (uint)(width * 4), 0); }
            finally { h.Free(); }
        }
    }

    /// Latest frame from the app (double-buffered; the XR loop always takes the newest).
    class FrameInbox
    {
        readonly object gate = new object();
        byte[] latest;
        int w, h;
        public volatile float Fov = 48, Distance = 1.6f;
        public volatile bool Closed;

        public void Put(byte[] px, int width, int height) { lock (gate) { latest = px; w = width; h = height; } }

        public bool Take(out byte[] px, out int width, out int height)
        {
            lock (gate)
            {
                px = latest; width = w; height = h;
                latest = null;
                return px != null;
            }
        }

        public void ReadLoop(Stream input)
        {
            var r = new BinaryReader(input);
            try
            {
                while (true)
                {
                    string tag = Encoding.ASCII.GetString(ReadExact(r, 4));
                    if (tag == "FXRF")
                    {
                        int width = r.ReadInt32(), height = r.ReadInt32(), bytes = r.ReadInt32();
                        if (width <= 0 || height <= 0 || width > 4096 || height > 4096 || bytes != width * height * 4)
                            throw new InvalidDataException("bad frame header");
                        Put(ReadExact(r, bytes), width, height);
                    }
                    else if (tag == "FXRC")
                    {
                        Fov = Math.Max(20f, Math.Min(150f, r.ReadSingle()));
                        Distance = Math.Max(0.5f, Math.Min(5f, r.ReadSingle()));
                        r.ReadInt32(); // reserved
                    }
                    else throw new InvalidDataException("unknown message " + tag);
                }
            }
            catch (EndOfStreamException) { }
            catch (Exception e) { Program.Status("ERROR input: " + e.Message); }
            Closed = true;
            // Watchdog: if an OpenXR call is blocking the main loop, still leave within 3 s.
            Thread.Sleep(3000);
            Program.Quit();
        }

        static byte[] ReadExact(BinaryReader r, int n)
        {
            byte[] b = r.ReadBytes(n);
            if (b.Length != n) throw new EndOfStreamException();
            return b;
        }
    }

    static class Program
    {
        static readonly object outLock = new object();
        static string lastStatus = "";

        public static void Status(string s)
        {
            lock (outLock)
            {
                if (s == lastStatus) return;
                lastStatus = s;
                Console.Out.WriteLine(s);
                Console.Out.Flush();
            }
        }

        [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);

        /// Leave right away; the OpenXR runtime cleans up after a process that exits.
        /// A hard exit on purpose: a normal exit unloads the runtime's DLLs, and with Meta Link
        /// that can deadlock and leave the process hanging forever.
        public static void Quit()
        {
            Status("STATE stopped");
            TerminateProcess(GetCurrentProcess(), 0);
        }

        static int Main(string[] args)
        {
            int code = Run(args);
            // Same hard exit as Quit(): never let runtime DLL unloading hang the process.
            TerminateProcess(GetCurrentProcess(), (uint)code);
            return code;
        }

        static int Run(string[] args)
        {
            bool test = Array.IndexOf(args, "--test") >= 0;
            var inbox = new FrameInbox();
            if (!test)
            {
                var t = new Thread(delegate () { inbox.ReadLoop(Console.OpenStandardInput()); }) { IsBackground = true };
                t.Start();
            }
            try
            {
                Run(inbox, test);
                Status("STATE stopped");
                return 0;
            }
            catch (DllNotFoundException)
            {
                Status("ERROR openxr_loader.dll is missing next to FlySimXR.exe");
                return 2;
            }
            catch (XrException e)
            {
                // -2 XR_ERROR_RUNTIME_FAILURE, -6 FORM_FACTOR_UNAVAILABLE (headset not ready), -51 RUNTIME_UNAVAILABLE
                string hint = e.Result == -6 ? " (headset not found: put it on and start Quest Link)"
                    : e.Result == -51 ? " (no OpenXR runtime: set Meta Horizon Link as the active OpenXR runtime)" : "";
                Status("ERROR " + e.Message + hint);
                return 3;
            }
            catch (Exception e)
            {
                Status("ERROR " + e.Message);
                return 4;
            }
        }

        static void Run(FrameInbox inbox, bool test)
        {
            // --- Instance with the D3D11 extension.
            ulong instance;
            IntPtr extName = Marshal.StringToHGlobalAnsi("XR_KHR_D3D11_enable");
            IntPtr extList = Marshal.AllocHGlobal(IntPtr.Size);
            Marshal.WriteIntPtr(extList, extName);
            using (var ci = new Mem(328))
            {
                ci.I32(0, Xr.TYPE_INSTANCE_CREATE_INFO);
                ci.Str(24, "FPV Sim", 128).I32(24 + 128, 1).Str(24 + 132, "FPV Sim", 128).I32(24 + 260, 1);
                ci.I64(24 + 264, (1L << 48) | (0L << 32) | 0); // XR_API_VERSION_1_0
                ci.I32(312, 1).Ptr(320, extList);
                Xr.Check(Xr.xrCreateInstance(ci.P, out instance), "xrCreateInstance");
            }
            Status("STATE instance");
            try
            {
                RunInstance(instance, inbox, test);
            }
            finally
            {
                Xr.xrDestroyInstance(instance);
                Marshal.FreeHGlobal(extList);
                Marshal.FreeHGlobal(extName);
            }
        }

        static void RunInstance(ulong instance, FrameInbox inbox, bool test)
        {
            ulong systemId;
            using (var gi = new Mem(24))
            {
                gi.I32(0, Xr.TYPE_SYSTEM_GET_INFO).I32(16, 1); // XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY
                // The headset can take a moment to appear after Link starts: retry for a while.
                int r = 0;
                for (int tries = 0; tries < 60; tries++)
                {
                    r = Xr.xrGetSystem(instance, gi.P, out systemId);
                    if (r >= 0) goto found;
                    Status("STATE waiting for headset");
                    if (inbox.Closed && !test) return;
                    Thread.Sleep(1000);
                }
                Xr.Check(r, "xrGetSystem");
                return;
            }
            found:

            // --- D3D11 device on the adapter the runtime wants.
            IntPtr fn;
            Xr.Check(Xr.xrGetInstanceProcAddr(instance, "xrGetD3D11GraphicsRequirementsKHR", out fn), "xrGetInstanceProcAddr");
            var getReq = (Xr.GetD3D11Requirements)Marshal.GetDelegateForFunctionPointer(fn, typeof(Xr.GetD3D11Requirements));
            long luid;
            using (var req = new Mem(32))
            {
                req.I32(0, Xr.TYPE_GRAPHICS_REQUIREMENTS_D3D11_KHR);
                Xr.Check(getReq(instance, systemId, req.P), "xrGetD3D11GraphicsRequirementsKHR");
                luid = req.RI64(16);
            }
            IntPtr device, context;
            string adapterName;
            D3D.CreateDevice(luid, out device, out context, out adapterName);
            Status("STATE gpu " + adapterName);

            // --- Session.
            ulong session;
            using (var binding = new Mem(24))
            using (var si = new Mem(32))
            {
                binding.I32(0, Xr.TYPE_GRAPHICS_BINDING_D3D11_KHR).Ptr(16, device);
                si.I32(0, Xr.TYPE_SESSION_CREATE_INFO).Ptr(8, binding.P).I64(24, (long)systemId);
                Xr.Check(Xr.xrCreateSession(instance, si.P, out session), "xrCreateSession");
            }
            Status("STATE session");

            ulong viewSpace;
            using (var rs = new Mem(48))
            {
                rs.I32(0, Xr.TYPE_REFERENCE_SPACE_CREATE_INFO).I32(16, 1); // XR_REFERENCE_SPACE_TYPE_VIEW: head-locked
                // XrPosef is all floats (4-byte aligned), so it starts at 20: orientation x,y,z,w then position.
                rs.F32(20 + 12, 1f); // identity orientation (w = 1)
                Xr.Check(Xr.xrCreateReferenceSpace(session, rs.P, out viewSpace), "xrCreateReferenceSpace");
            }

            long format = PickFormat(session);
            var screen = new Screen(session, format);
            var ev = new Mem(4016);
            var frameState = new Mem(40);
            var waitInfo = new Mem(16).I32(0, Xr.TYPE_FRAME_WAIT_INFO);
            var beginInfo = new Mem(16).I32(0, Xr.TYPE_FRAME_BEGIN_INFO);
            var layer = new Mem(112);
            var layers = new Mem(8);
            var endInfo = new Mem(40);
            bool running = false;
            bool quit = false;
            bool exitRequested = false;
            int exitDeadline = 0;
            byte[] frame = null;
            int fw = 1280, fh = 720;
            int tick = 0;

            try
            {
                while (!quit)
                {
                    // --- Events.
                    while (true)
                    {
                        ev.I32(0, Xr.TYPE_EVENT_DATA_BUFFER).Ptr(8, IntPtr.Zero);
                        int pr = Xr.xrPollEvent(instance, ev.P);
                        if (pr == Xr.EVENT_UNAVAILABLE) break;
                        Xr.Check(pr, "xrPollEvent");
                        int type = ev.RI32(0);
                        if (type == 17) { quit = true; break; } // instance loss pending
                        if (type != Xr.TYPE_EVENT_DATA_SESSION_STATE_CHANGED) continue;
                        int state = ev.RI32(24);
                        switch (state)
                        {
                            case 2: // READY
                                using (var bi = new Mem(24))
                                {
                                    bi.I32(0, Xr.TYPE_SESSION_BEGIN_INFO).I32(16, 2); // primary stereo
                                    Xr.Check(Xr.xrBeginSession(session, bi.P), "xrBeginSession");
                                }
                                running = true;
                                Status("STATE ready");
                                break;
                            case 4: Status("STATE visible"); break;
                            case 5: Status("STATE focused"); break;
                            case 3: Status("STATE synchronized"); break;
                            case 6: // STOPPING
                                Xr.xrEndSession(session);
                                running = false;
                                Status("STATE paused");
                                break;
                            case 7: case 8: // LOSS_PENDING / EXITING
                                if (exitRequested) Quit();
                                quit = true;
                                break;
                        }
                    }
                    // The app closed our input (VR turned off). Ask a running session to end, give it
                    // up to 2 s, then leave: the runtime drops a dead process's session by itself, and
                    // tearing down an idle session can block for a long time in some runtimes.
                    if (inbox.Closed && !test)
                    {
                        if (!running || (exitRequested && Environment.TickCount - exitDeadline > 0)) Quit();
                        if (!exitRequested)
                        {
                            Xr.xrRequestExitSession(session);
                            exitRequested = true;
                            exitDeadline = Environment.TickCount + 2000;
                        }
                    }
                    if (!running) { Thread.Sleep(50); continue; }

                    // --- Frame.
                    frameState.I32(0, Xr.TYPE_FRAME_STATE).Ptr(8, IntPtr.Zero);
                    Xr.Check(Xr.xrWaitFrame(session, waitInfo.P, frameState.P), "xrWaitFrame");
                    long displayTime = frameState.RI64(16);
                    bool shouldRender = frameState.RI32(32) != 0;
                    Xr.Check(Xr.xrBeginFrame(session, beginInfo.P), "xrBeginFrame");

                    byte[] px; int w, h;
                    if (test) { tick++; px = TestPattern(fw, fh, tick); w = fw; h = fh; }
                    else if (!inbox.Take(out px, out w, out h)) px = null;
                    if (px != null) { frame = px; fw = w; fh = h; }

                    int layerCount = 0;
                    if (shouldRender && frame != null)
                    {
                        screen.Ensure(fw, fh, device);
                        screen.Draw(context, frame, px != null);
                        float aspect = (float)fw / fh;
                        float dist = inbox.Distance;
                        float width = 2f * dist * (float)Math.Tan(inbox.Fov * Math.PI / 360.0);
                        layer.I32(0, Xr.TYPE_COMPOSITION_LAYER_QUAD).Ptr(8, IntPtr.Zero);
                        layer.I64(16, 0).I64(24, (long)viewSpace).I32(32, 0); // both eyes
                        layer.I64(40, (long)screen.Handle).I32(48, 0).I32(52, 0).I32(56, fw).I32(60, fh).I32(64, 0);
                        layer.F32(72, 0).F32(76, 0).F32(80, 0).F32(84, 1f); // orientation identity
                        layer.F32(88, 0).F32(92, 0).F32(96, -dist); // straight ahead
                        layer.F32(100, width).F32(104, width / aspect);
                        layers.Ptr(0, layer.P);
                        layerCount = 1;
                    }
                    endInfo.I32(0, Xr.TYPE_FRAME_END_INFO).Ptr(8, IntPtr.Zero).I64(16, displayTime);
                    endInfo.I32(24, 1).I32(28, layerCount).Ptr(32, layerCount > 0 ? layers.P : IntPtr.Zero); // opaque
                    Xr.Check(Xr.xrEndFrame(session, endInfo.P), "xrEndFrame");
                    if (layerCount > 0) Status("STATE streaming");
                }
            }
            finally
            {
                screen.Dispose();
                Xr.xrDestroySession(session);
            }
        }

        static long PickFormat(ulong session)
        {
            uint n;
            Xr.Check(Xr.xrEnumerateSwapchainFormats(session, 0, out n, null), "xrEnumerateSwapchainFormats");
            var f = new long[n];
            Xr.Check(Xr.xrEnumerateSwapchainFormats(session, n, out n, f), "xrEnumerateSwapchainFormats");
            // Our pixels are BGRA in sRGB, which is exactly DXGI_FORMAT_B8G8R8A8_UNORM_SRGB (91).
            foreach (var x in f) if (x == 91) return 91;
            foreach (var x in f) if (x == 87) return 87; // B8G8R8A8_UNORM
            throw new Exception("the runtime offers no BGRA swapchain format");
        }

        static byte[] TestPattern(int w, int h, int t)
        {
            var b = new byte[w * h * 4];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    int i = (y * w + x) * 4;
                    bool bar = ((x + t * 4) / 80) % 2 == 0;
                    b[i] = (byte)(bar ? 26 : 20); b[i + 1] = (byte)(bar ? 106 : 15); b[i + 2] = (byte)(bar ? 255 : 11); b[i + 3] = 255;
                }
            return b;
        }
    }

    /// The goggle screen: an OpenXR swapchain the size of the incoming frames.
    class Screen : IDisposable
    {
        readonly ulong session;
        readonly long format;
        public ulong Handle;
        IntPtr[] textures = new IntPtr[0];
        int width, height;

        public Screen(ulong session, long format) { this.session = session; this.format = format; }

        public void Ensure(int w, int h, IntPtr device)
        {
            if (Handle != 0 && w == width && h == height) return;
            Dispose();
            using (var ci = new Mem(64))
            {
                ci.I32(0, Xr.TYPE_SWAPCHAIN_CREATE_INFO);
                ci.I64(24, 0x1 | 0x10 | 0x20); // color attachment | transfer dst | sampled
                ci.I64(32, format).I32(40, 1).I32(44, w).I32(48, h).I32(52, 1).I32(56, 1).I32(60, 1);
                Xr.Check(Xr.xrCreateSwapchain(session, ci.P, out Handle), "xrCreateSwapchain");
            }
            uint n;
            Xr.Check(Xr.xrEnumerateSwapchainImages(Handle, 0, out n, IntPtr.Zero), "xrEnumerateSwapchainImages");
            using (var imgs = new Mem((int)n * 24))
            {
                for (int i = 0; i < n; i++) imgs.I32(i * 24, Xr.TYPE_SWAPCHAIN_IMAGE_D3D11_KHR);
                Xr.Check(Xr.xrEnumerateSwapchainImages(Handle, n, out n, imgs.P), "xrEnumerateSwapchainImages");
                textures = new IntPtr[n];
                for (int i = 0; i < n; i++) textures[i] = imgs.RPtr(i * 24 + 16);
            }
            width = w;
            height = h;
        }

        public void Draw(IntPtr context, byte[] pixels, bool fresh)
        {
            uint index;
            using (var ai = new Mem(16)) { ai.I32(0, Xr.TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO); Xr.Check(Xr.xrAcquireSwapchainImage(Handle, ai.P, out index), "xrAcquireSwapchainImage"); }
            using (var wi = new Mem(24)) { wi.I32(0, Xr.TYPE_SWAPCHAIN_IMAGE_WAIT_INFO).I64(16, 100000000L); Xr.Check(Xr.xrWaitSwapchainImage(Handle, wi.P), "xrWaitSwapchainImage"); }
            // Swapchain images rotate, so every image needs the current frame even if it didn't change.
            D3D.Upload(context, textures[index], pixels, width);
            using (var ri = new Mem(16)) { ri.I32(0, Xr.TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO); Xr.Check(Xr.xrReleaseSwapchainImage(Handle, ri.P), "xrReleaseSwapchainImage"); }
        }

        public void Dispose()
        {
            if (Handle != 0) Xr.xrDestroySwapchain(Handle);
            Handle = 0;
        }
    }
}
