#include "ScratchVoice.h"
#include <cassert>
#include <cmath>
#include <vector>
#include <iostream>
int main() {
    constexpr size_t n=48000;
    std::vector<float> a(n),b(n),l(512),r(512);
    for(size_t i=0;i<n;++i) { a[i]=float(i)/n; b[i]=-a[i]; }
    auto *voice=tb_scratch_create(48000);
    assert(voice && tb_scratch_load(voice,a.data(),b.data(),n,5));
    tb_scratch_target(voice,5.5);
    tb_scratch_active(voice,1);
    for(int i=0;i<60;++i)tb_scratch_render(voice,l.data(),r.data(),l.size());
    const double middle=tb_scratch_position(voice);
    assert(middle>5.45 && middle<5.55 && l[400]>0.1 && std::abs(l[400]+r[400])<1e-5);
    tb_scratch_target(voice,5.15);
    for(int i=0;i<60;++i)tb_scratch_render(voice,l.data(),r.data(),l.size());
    assert(tb_scratch_position(voice)<middle-0.25); // real reverse transport
    tb_scratch_active(voice,0);
    for(int i=0;i<20;++i)tb_scratch_render(voice,l.data(),r.data(),l.size());
    assert(std::abs(l[400])<1e-5);
    tb_scratch_destroy(voice);
    std::cout<<"ScratchVoiceTests PASS (forward, reverse, stereo, release)\n";
}
