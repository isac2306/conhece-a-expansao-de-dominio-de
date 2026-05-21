using UnityEngine;

namespace UnlimitedVoid.UnityBase.Vision
{
    public sealed class MediaPipeAndroidPersonMaskProvider : MonoBehaviour, IPersonMaskProvider
    {
        [Header("Android Bridge")]
        [SerializeField] private string javaBridgeClass = "com.isac.unlimitedvoid.bridge.ImageSegmenterBridge";
        [SerializeField] private bool initializeOnStart = true;
        [SerializeField] private int textureWidth = 256;
        [SerializeField] private int textureHeight = 256;

        private AndroidJavaObject _bridge;
        private Texture2D _maskTexture;
        private Color32[] _pixels;

        private void Start()
        {
            EnsureTexture();
            if (initializeOnStart)
            {
                InitializeBridge();
            }
        }

        private void OnDestroy()
        {
            DisposeBridge();
            if (_maskTexture != null)
            {
                Destroy(_maskTexture);
            }
        }

        public bool TryGetMask(out Texture maskTexture)
        {
            EnsureTexture();

#if UNITY_ANDROID && !UNITY_EDITOR
            if (_bridge != null && _bridge.Call<bool>("hasLatestMask"))
            {
                var bytes = _bridge.Call<byte[]>("consumeLatestMask");
                if (bytes != null && bytes.Length == _pixels.Length)
                {
                    for (int index = 0; index < bytes.Length; index += 1)
                    {
                        var value = bytes[index];
                        _pixels[index] = new Color32(value, value, value, 255);
                    }

                    _maskTexture.SetPixels32(_pixels);
                    _maskTexture.Apply(false, false);
                }
            }
#endif

            maskTexture = _maskTexture;
            return _maskTexture != null;
        }

        [ContextMenu("Initialize Android Bridge")]
        public void InitializeBridge()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (_bridge != null)
            {
                return;
            }

            using var bridgeClass = new AndroidJavaClass(javaBridgeClass);
            _bridge = bridgeClass.CallStatic<AndroidJavaObject>("create");
            _bridge?.Call("initialize");
#endif
        }

        [ContextMenu("Dispose Android Bridge")]
        public void DisposeBridge()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (_bridge == null)
            {
                return;
            }

            _bridge.Call("dispose");
            _bridge.Dispose();
            _bridge = null;
#endif
        }

        private void EnsureTexture()
        {
            if (_maskTexture != null)
            {
                return;
            }

            _maskTexture = new Texture2D(textureWidth, textureHeight, TextureFormat.RGBA32, false, true)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                name = "MediaPipeAndroidMask",
            };
            _pixels = new Color32[textureWidth * textureHeight];
        }
    }
}
