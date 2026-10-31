#include "ScratchVoice.h"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <memory>
#include <vector>

struct TBClip {
    std::vector<float> left, right;
    double start;
    TBClip(const float *l, const float *r, size_t count, double origin)
        : left(l, l + count), right(r, r + count), start(origin) {}
};
struct TBScratchVoice {
    const double rate;
    std::atomic<TBClip *> clip{nullptr};
    std::vector<TBClip *> retired; // control thread only
    std::atomic<unsigned> readers{0};
    std::atomic<double> target{0}, position{0};
    std::atomic<bool> active{false};
    std::atomic<unsigned> generation{0};
    unsigned seenGeneration{0}; // audio thread only
    double phase{0}, speed{0}, gain{0}; // audio thread only
    explicit TBScratchVoice(double r) : rate(r) {}
};
extern "C" TBScratchVoice *tb_scratch_create(double rate) {
    return std::isfinite(rate) && rate >= 8000 && rate <= 192000 ? new TBScratchVoice(rate) : nullptr;
}
extern "C" void tb_scratch_destroy(TBScratchVoice *v) {
    if (!v) return;
    delete v->clip.load();
    for (auto *old : v->retired) delete old;
    delete v; // caller stops audio callback first
}
extern "C" void tb_scratch_reap(TBScratchVoice *v) {
    if (!v || v->readers.load(std::memory_order_acquire)) return;
    for (auto *old : v->retired) delete old;
    v->retired.clear();
}
extern "C" int tb_scratch_load(TBScratchVoice *v, const float *l, const float *r,
                                  size_t count, double origin) {
    if (!v || !l || !r || !std::isfinite(origin) || origin < 0 ||
        count < 32 || count > 192000 * 12) return 0;
    auto *next = new TBClip(l, r, count, origin);
    v->active.store(false, std::memory_order_release);
    auto *old = v->clip.exchange(next, std::memory_order_acq_rel);
    if (old) v->retired.push_back(old);
    v->target.store(origin, std::memory_order_release);
    v->generation.fetch_add(1, std::memory_order_release);
    tb_scratch_reap(v);
    return 1;
}
extern "C" void tb_scratch_target(TBScratchVoice *v, double seconds) {
    if (v && std::isfinite(seconds)) v->target.store(seconds, std::memory_order_release);
}
extern "C" void tb_scratch_active(TBScratchVoice *v, int on) {
    if (v) v->active.store(on != 0, std::memory_order_release);
}
extern "C" double tb_scratch_position(const TBScratchVoice *v) {
    return v ? v->position.load(std::memory_order_relaxed) : 0;
}
extern "C" void tb_scratch_render(TBScratchVoice *v, float *l, float *r, size_t count) {
    if (!l || !r) return;
    if (!v) { std::fill_n(l,count,0.f); std::fill_n(r,count,0.f); return; }
    v->readers.fetch_add(1,std::memory_order_acq_rel);
    const TBClip *clip = v->clip.load(std::memory_order_acquire);
    const bool on = v->active.load(std::memory_order_acquire) && clip;
    const double target = v->target.load(std::memory_order_relaxed);
    const unsigned generation = v->generation.load(std::memory_order_acquire);
    if (clip && generation != v->seenGeneration) {
        v->seenGeneration = generation;
        v->phase = std::clamp((target-clip->start)*v->rate,0.,double(clip->left.size()-2));
        v->speed = 0;
        v->gain = 0;
    }
    if (on && v->gain <= 0) { v->phase = std::clamp((target-clip->start)*v->rate,0.,double(clip->left.size()-2)); v->speed=0; }
    for (size_t i=0;i<count;++i) {
        v->gain += ((on ? 1. : 0.)-v->gain)*0.004; // ~5 ms fade at 48 kHz
        v->gain = std::clamp(v->gain,0.,1.);
        if (!clip || v->gain < 0.0001) { l[i]=r[i]=0; continue; }
        if (on) {
            const double goal = std::clamp((target-clip->start)*v->rate,0.,double(clip->left.size()-2));
            const double wanted = std::clamp((goal-v->phase)*0.005,-3.,3.);
            v->speed += std::clamp(wanted-v->speed,-0.003,0.003);
            v->phase = std::clamp(v->phase+v->speed,0.,double(clip->left.size()-2));
        }
        v->phase=std::clamp(v->phase,0.,double(clip->left.size()-2));
        const size_t index=size_t(v->phase);
        const float mix=float(v->phase-double(index));
        l[i]=((1-mix)*clip->left[index]+mix*clip->left[index+1])*float(v->gain);
        r[i]=((1-mix)*clip->right[index]+mix*clip->right[index+1])*float(v->gain);
    }
    if (clip) v->position.store(clip->start+v->phase/v->rate,std::memory_order_relaxed);
    v->readers.fetch_sub(1,std::memory_order_release);
}
