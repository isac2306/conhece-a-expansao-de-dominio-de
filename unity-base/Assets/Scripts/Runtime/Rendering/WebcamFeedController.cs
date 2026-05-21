using UnityEngine;

namespace UnlimitedVoid.UnityBase.Rendering
{
    public sealed class WebcamFeedController : MonoBehaviour
    {
        [SerializeField] private bool playOnStart = true;
        [SerializeField] private string preferredDeviceName = "";
        [SerializeField] private int requestedWidth = 1280;
        [SerializeField] private int requestedHeight = 720;
        [SerializeField] private int requestedFps = 30;
        [SerializeField] private bool stopOnDisable = true;

        private WebCamTexture _webcamTexture;

        public Texture SourceTexture => _webcamTexture;
        public bool IsPlaying => _webcamTexture != null && _webcamTexture.isPlaying;

        private void Start()
        {
            if (playOnStart)
            {
                Play();
            }
        }

        private void OnDisable()
        {
            if (stopOnDisable)
            {
                Stop();
            }
        }

        public void Play()
        {
            if (IsPlaying)
            {
                return;
            }

            var deviceName = ResolveDeviceName();
            if (string.IsNullOrEmpty(deviceName))
            {
                Debug.LogWarning("No webcam device found for WebcamFeedController.");
                return;
            }

            _webcamTexture = new WebCamTexture(deviceName, requestedWidth, requestedHeight, requestedFps);
            _webcamTexture.Play();
        }

        public void Stop()
        {
            if (_webcamTexture == null)
            {
                return;
            }

            if (_webcamTexture.isPlaying)
            {
                _webcamTexture.Stop();
            }

            Destroy(_webcamTexture);
            _webcamTexture = null;
        }

        private string ResolveDeviceName()
        {
            if (!string.IsNullOrEmpty(preferredDeviceName))
            {
                foreach (var device in WebCamTexture.devices)
                {
                    if (device.name == preferredDeviceName)
                    {
                        return device.name;
                    }
                }
            }

            return WebCamTexture.devices.Length > 0 ? WebCamTexture.devices[0].name : string.Empty;
        }
    }
}
