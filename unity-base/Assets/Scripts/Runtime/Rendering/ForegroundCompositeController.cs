using UnityEngine;
using UnlimitedVoid.UnityBase.Vision;

namespace UnlimitedVoid.UnityBase.Rendering
{
    [RequireComponent(typeof(Renderer))]
    public sealed class ForegroundCompositeController : MonoBehaviour
    {
        [SerializeField] private Renderer targetRenderer;
        [SerializeField] private WebcamFeedController webcamFeed;
        [SerializeField] private MonoBehaviour maskProviderSource;
        [SerializeField] private bool flipCameraX = true;
        [SerializeField] private float opacity = 1f;

        private Material _runtimeMaterial;
        private IPersonMaskProvider _maskProvider;

        private void Awake()
        {
            if (targetRenderer == null)
            {
                targetRenderer = GetComponent<Renderer>();
            }

            _maskProvider = maskProviderSource as IPersonMaskProvider;

            if (targetRenderer != null && targetRenderer.sharedMaterial != null)
            {
                _runtimeMaterial = new Material(targetRenderer.sharedMaterial);
                targetRenderer.material = _runtimeMaterial;
            }
        }

        private void LateUpdate()
        {
            if (_runtimeMaterial == null || webcamFeed == null || webcamFeed.SourceTexture == null)
            {
                return;
            }

            _runtimeMaterial.SetTexture("_CameraTex", webcamFeed.SourceTexture);
            _runtimeMaterial.SetFloat("_FlipX", flipCameraX ? 1f : 0f);
            _runtimeMaterial.SetFloat("_Opacity", Mathf.Clamp01(opacity));

            if (_maskProvider != null && _maskProvider.TryGetMask(out var maskTexture) && maskTexture != null)
            {
                _runtimeMaterial.SetTexture("_MaskTex", maskTexture);
                _runtimeMaterial.SetFloat("_HasMask", 1f);
            }
            else
            {
                _runtimeMaterial.SetFloat("_HasMask", 0f);
            }
        }
    }
}
