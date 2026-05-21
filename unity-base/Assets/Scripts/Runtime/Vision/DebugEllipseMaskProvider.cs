using UnityEngine;

namespace UnlimitedVoid.UnityBase.Vision
{
    public sealed class DebugEllipseMaskProvider : MonoBehaviour, IPersonMaskProvider
    {
        [SerializeField] private int textureSize = 256;
        [SerializeField] private Vector2 centerNormalized = new Vector2(0.5f, 0.52f);
        [SerializeField] private Vector2 ellipseSize = new Vector2(0.52f, 0.84f);
        [SerializeField] private float edgeSoftness = 0.18f;
        [SerializeField] private bool followMouse = false;

        private Texture2D _maskTexture;
        private Color32[] _pixels;

        private void OnEnable()
        {
            EnsureTexture();
            RebuildMask();
        }

        private void OnDisable()
        {
            if (_maskTexture != null)
            {
                Destroy(_maskTexture);
                _maskTexture = null;
                _pixels = null;
            }
        }

        private void Update()
        {
            if (followMouse)
            {
                centerNormalized = new Vector2(
                    Mathf.Clamp01(Input.mousePosition.x / Mathf.Max(1f, Screen.width)),
                    Mathf.Clamp01(Input.mousePosition.y / Mathf.Max(1f, Screen.height)));
            }

            RebuildMask();
        }

        public bool TryGetMask(out Texture maskTexture)
        {
            EnsureTexture();
            maskTexture = _maskTexture;
            return _maskTexture != null;
        }

        private void EnsureTexture()
        {
            if (_maskTexture != null)
            {
                return;
            }

            _maskTexture = new Texture2D(textureSize, textureSize, TextureFormat.RGBA32, false, true)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                name = "DebugEllipseMask",
            };
            _pixels = new Color32[textureSize * textureSize];
        }

        private void RebuildMask()
        {
            if (_maskTexture == null || _pixels == null)
            {
                return;
            }

            for (int y = 0; y < textureSize; y += 1)
            {
                for (int x = 0; x < textureSize; x += 1)
                {
                    var uv = new Vector2(
                        (x + 0.5f) / textureSize,
                        (y + 0.5f) / textureSize);
                    var dx = (uv.x - centerNormalized.x) / Mathf.Max(0.001f, ellipseSize.x * 0.5f);
                    var dy = (uv.y - centerNormalized.y) / Mathf.Max(0.001f, ellipseSize.y * 0.5f);
                    var distance = Mathf.Sqrt(dx * dx + dy * dy);
                    var alpha = 1f - Mathf.SmoothStep(1f - edgeSoftness, 1f + edgeSoftness, distance);
                    var value = (byte)Mathf.RoundToInt(Mathf.Clamp01(alpha) * 255f);
                    _pixels[y * textureSize + x] = new Color32(value, value, value, 255);
                }
            }

            _maskTexture.SetPixels32(_pixels);
            _maskTexture.Apply(false, false);
        }
    }
}
