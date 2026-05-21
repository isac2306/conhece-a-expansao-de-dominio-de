using UnityEngine;

namespace UnlimitedVoid.UnityBase.Vision
{
    public sealed class MediaPipeAndroidHandLandmarkProvider : MonoBehaviour, IHandLandmarkProvider
    {
        [Header("Android Bridge")]
        [SerializeField] private string javaBridgeClass = "com.isac.unlimitedvoid.bridge.HandLandmarkerBridge";
        [SerializeField] private bool initializeOnStart = true;

        private readonly HandLandmarkFrame _frame = new HandLandmarkFrame();
        private AndroidJavaObject _bridge;

        private void Start()
        {
            if (initializeOnStart)
            {
                InitializeBridge();
            }
        }

        private void OnDestroy()
        {
            DisposeBridge();
        }

        public bool TryGetFrame(out HandLandmarkFrame frame)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (_bridge == null)
            {
                frame = null;
                return false;
            }

            if (!_bridge.Call<bool>("hasLatestFrame"))
            {
                frame = null;
                return false;
            }

            var values = _bridge.Call<float[]>("consumeLatestFrame");
            if (values == null || values.Length < HandLandmarkFrame.LandmarkCount * 2 + 1)
            {
                frame = null;
                return false;
            }

            _frame.TrackingConfidence = values[0];
            for (int pointIndex = 0; pointIndex < HandLandmarkFrame.LandmarkCount; pointIndex += 1)
            {
                var valueIndex = 1 + pointIndex * 2;
                _frame[pointIndex] = new Vector2(values[valueIndex], values[valueIndex + 1]);
            }

            frame = _frame;
            return true;
#else
            frame = null;
            return false;
#endif
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
    }
}
