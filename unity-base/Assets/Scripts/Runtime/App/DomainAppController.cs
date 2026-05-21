using System.Collections.Generic;
using UnityEngine;
using UnlimitedVoid.UnityBase.Gesture;
using UnlimitedVoid.UnityBase.Rendering;
using UnlimitedVoid.UnityBase.Vision;

namespace UnlimitedVoid.UnityBase.App
{
    public sealed class DomainAppController : MonoBehaviour
    {
        [Header("Scene References")]
        [SerializeField] private WebcamFeedController webcamFeed;
        [SerializeField] private DomainActivationController activationController;
        [SerializeField] private MonoBehaviour handLandmarkProviderSource;

        [Header("Gesture Tuning")]
        [SerializeField] private DomainGestureProfile baseProfile = new DomainGestureProfile();
        [SerializeField] private float readyScoreThreshold = 0.76f;
        [SerializeField] private float resetScoreThreshold = 0.34f;
        [SerializeField] private int stableFramesRequired = 12;
        [SerializeField] private bool requireReleaseAfterActivation = true;

        [Header("Calibration")]
        [SerializeField] private int calibrationSampleTarget = 24;
        [SerializeField] private float calibrationMinScore = 0.48f;

        [Header("Debug")]
        [SerializeField] private bool autoStartWebcam = true;
        [SerializeField] private KeyCode forceActivateKey = KeyCode.Space;

        private readonly List<DomainGestureMetrics> _calibrationSamples = new List<DomainGestureMetrics>(32);
        private IHandLandmarkProvider _handLandmarkProvider;
        private DomainGestureProfile _runtimeProfile;
        private int _stableFrames;
        private bool _needsReset;

        public DomainGestureEvaluation LastEvaluation { get; private set; }
        public string StatusLabel { get; private set; } = "Idle";
        public bool CalibrationMode { get; private set; }

        private void Awake()
        {
            _runtimeProfile = baseProfile != null ? baseProfile.Clone() : new DomainGestureProfile();
            _handLandmarkProvider = handLandmarkProviderSource as IHandLandmarkProvider;
        }

        private void Start()
        {
            if (autoStartWebcam && webcamFeed != null)
            {
                webcamFeed.Play();
            }
        }

        private void Update()
        {
            if (activationController != null && Input.GetKeyDown(forceActivateKey))
            {
                activationController.TryActivate(new Vector2(0.5f, 0.45f));
                StatusLabel = "Debug activation";
            }

            if (_handLandmarkProvider == null)
            {
                StatusLabel = "Assign a hand landmark provider";
                return;
            }

            if (!_handLandmarkProvider.TryGetFrame(out var frame) || frame == null)
            {
                _stableFrames = Mathf.Max(0, _stableFrames - 2);
                StatusLabel = "No hand tracked";
                return;
            }

            LastEvaluation = DomainGestureEvaluator.Evaluate(frame, _runtimeProfile);

            if (_needsReset)
            {
                if (LastEvaluation.OverallScore < resetScoreThreshold)
                {
                    _needsReset = false;
                    StatusLabel = "Rearmed";
                }
                else
                {
                    StatusLabel = "Release and do the gesture again";
                }
                return;
            }

            if (CalibrationMode)
            {
                UpdateCalibration();
                return;
            }

            if (LastEvaluation.OverallScore > readyScoreThreshold)
            {
                _stableFrames += 1;
            }
            else
            {
                _stableFrames = Mathf.Max(0, _stableFrames - 2);
            }

            var ready = LastEvaluation.OverallScore > readyScoreThreshold && _stableFrames >= stableFramesRequired;
            StatusLabel = ready ? "Gesture ready" : $"Reading gesture ({Mathf.RoundToInt(LastEvaluation.OverallScore * 100f)}%)";

            if (ready && activationController != null)
            {
                var activated = activationController.TryActivate(LastEvaluation.Metrics.CenterNormalized);
                if (activated && requireReleaseAfterActivation)
                {
                    _stableFrames = 0;
                    _needsReset = true;
                    StatusLabel = "Domain activated";
                }
            }
        }

        public void BeginCalibration()
        {
            CalibrationMode = true;
            _calibrationSamples.Clear();
            StatusLabel = "Calibration started";
        }

        public void CancelCalibration()
        {
            CalibrationMode = false;
            _calibrationSamples.Clear();
            StatusLabel = "Calibration cancelled";
        }

        public void ResetToBaseProfile()
        {
            _runtimeProfile = baseProfile != null ? baseProfile.Clone() : new DomainGestureProfile();
            _calibrationSamples.Clear();
            CalibrationMode = false;
            StatusLabel = "Profile reset";
        }

        private void UpdateCalibration()
        {
            if (LastEvaluation.OverallScore < calibrationMinScore)
            {
                StatusLabel = "Hold a cleaner gesture for calibration";
                return;
            }

            _calibrationSamples.Add(LastEvaluation.Metrics);
            StatusLabel = $"Calibrating {_calibrationSamples.Count}/{calibrationSampleTarget}";

            if (_calibrationSamples.Count < calibrationSampleTarget)
            {
                return;
            }

            _runtimeProfile = BuildProfile(_calibrationSamples);
            _calibrationSamples.Clear();
            CalibrationMode = false;
            StatusLabel = "Calibration complete";
        }

        private static DomainGestureProfile BuildProfile(IReadOnlyList<DomainGestureMetrics> samples)
        {
            float indexExtension = 0f;
            float middleExtension = 0f;
            float tipGap = 0f;
            float crossAngle = 0f;
            float ringCurl = 0f;
            float pinkyCurl = 0f;

            for (int index = 0; index < samples.Count; index += 1)
            {
                indexExtension += samples[index].IndexExtension;
                middleExtension += samples[index].MiddleExtension;
                tipGap += samples[index].TipGap;
                crossAngle += samples[index].Angle;
                ringCurl += samples[index].RingCurl;
                pinkyCurl += samples[index].PinkyCurl;
            }

            var divisor = Mathf.Max(1, samples.Count);
            return new DomainGestureProfile
            {
                IndexExtension = indexExtension / divisor,
                MiddleExtension = middleExtension / divisor,
                TipGap = tipGap / divisor,
                CrossAngle = crossAngle / divisor,
                RingCurl = ringCurl / divisor,
                PinkyCurl = pinkyCurl / divisor,
            };
        }
    }
}
