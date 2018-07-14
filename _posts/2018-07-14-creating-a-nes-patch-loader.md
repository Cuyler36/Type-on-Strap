---
layout: post
title: Creating a NES Patch Loader
feature-img: "assets/img/nesaceloader/banner.png"
thumbnail: "assets/img/nesaceloader/banner.png"
tags: [Animal Crossing, NES, Arbitrary Code Execution, Assembly]
excerpt_separator: <!--more-->
---

Arbitrary code execution in Animal Crossing has been something I've been interested in finding for some time now. After James Chambers informed me about the PAT tag for the NES emulator, which could possibly allow for arbitrary writes to RAM, I had to investigate more.
<!--more-->
James also mentioned that due to certain restrictions, we could only write a portion of RAM rather than all of it. Writes were also limited in size. He theorized the best way to get around these limitations would be by creating a custom loader. With this knowledge in hand, I set out to do just that.

### Designing the Patch Loader
The basic idea that I had for the loader was simple. Treat the NES ROM as data itself, rather than a ROM. The loader would simply copy the NES _ROM_ Data to a specified location in RAM. The next thing I had to consider were the limitations. Specifically, the ROM loader had to fulfill the following things:
* It must be written to memory between 0x80000000 and 0x807FFFFF. This is the write address limitation I mentioned earlier.
* It must be no larger than 251 bytes in size, as the tag responsible for patching used four bytes for other information.

#### A Deeper Look at the Limitations
Let's take a break for a moment to breakdown why the limitations mentioned above exist. First, let's look at the write address limitation. The GameCube's main RAM is 24 megabytes in size, and starts at 0x80000000. This makes the effective address range 0x80000000 - 0x817FFFFF. So why can the tag only patch to a third of that address? The answer lies in the code responsible for calculating where to write the address. Let's take a look at that code:

![PAT Tag Handling Code]({{ site.baseurl }}/assets/img/nesaceloader/nesinfo_tag_process2_PAT_typecheck.png)

Taking the above code into account, we can see there are `four` cases that determine how the write address is calcuated. The first one checks if the PAT type is 3. If so, it will clear the address entirely, resetting any address we had before.

The second one checks if the type is 2. If so, it'll take the next two bytes after the PAT type and use that as a 16 bit value to add to the current patch address.

The third one checks if the type is 9. If so, it takes the next two bytes and shifts it left by four, which is the same as multiplying by 16, and adds that to the current patch address.

The final case checks if the type is between 0x80 and 0xFF. If so, it adds the type to 0x7F80, and shifts it left by 16, then adds the 16 bit value to that. This is where the write problem stems from. Let's look at what would happen if we set the PAT type to 0xFF and use 0xFFFF as the 16 bit add value!

The equation ends up looking like this:
> ((0x7F80 + 0xFF) << 16) + 0xFFFF

That then becomes:
> (0x807F << 16) + 0xFFFF

Which becomes:
> 0x807F0000 + 0xFFFF

Finally, that equates to:
> 0x807FFFFF

That's how the maximum address is reached. Great. So we now know for sure we can only write to addressess between 0x80000000 and 0x807FFFFF. What about the write size limitation though? To understand that, we need to take a look at the PAT tag structure:

```c
struct TagPAT {
	char Tag[3] = "PAT";
	unsigned char Size;
	unsigned char Type;
	unsigned char CopySize;
	unsigned short WriteOffset;
};
```

Looking at the structure, we can see that there are `two` bytes responsible for size. The first one _Size_ refers to the entire size of the tag data, minus the Tag type that preceeds it. Since it's a byte, it can be between 0 and 255 (0x00 - 0xFF). The second size value, `CopySize`, is how many bytes the emulator should copy during patching. Since we know the maximum size the tag can be is 255 bytes, we can just subtract the size of non-patch data in the struct to figure out the maximum copy size. Since the first size isn't included, we end up with four bytes of data reserved for calculating the write address.

> 255 - 4 = 251 (0xFF - 0x04 = 0xFB)

So that's where the maximum patch size of 251 comes from! Now that we know our limitations in depth, we can pick where we'll write the loader to!

#### Determining the Write Address
As nice as it'd be to just pick 0x80000000 as the patch loader write address, we need to take caution in where we write it to. The lower address in RAM contain important game information and code that would likely crash the game if it was overwritten! Knowing this, I fired up Dolphin Emulator in debug mode, and dumped the game's RAM while it was running. After a short while of searching, I found a large enough section of unused RAM located at 0x80003640.

![RAM at 0x80003640]({{ site.baseurl }}/assets/img/nesaceloader/animal-crossing-memory.png)

Now that we've got an address to write the loader to, we can finally get to writing it.

### Programming the Loader
Since we have limited space, the best language choice for programming the patch loader is PowerPC Assembly. Now that the language has been decided, a standard header for reading the fake NES ROM data would need to be decided on. Originally, I considered just reading data until the first zero byte was hit and then stopping. I ultimately decided against that, as it was very inflexible. I settled on having the NES ROM have a header structure like so:

```c
struct NESROMPatchHeader{
	unsigned int WriteAddress;
	unsigned int PatchSize;
	unsigned int IsExecutable;
};
```

Let's break down what each value in the header is for.

`WriteAddress` is the absolute address in RAM to begin writing to. It can be anywhere in the full RAM range of 0x80000000 to 0x817FFFFF.

`PatchSize` is the size of the patch data in the fake NES ROM that will be copied starting at `WriteAddress`.

`IsExecutable` is treated as a boolean that determines if the patch loader should execute the data it copied. Anything other than 0 for this value will mean it is executable.

The patch data should follow immediately after the header. An example of a patch I made for enabling Zurumode 2 looks like this:

![Zurumode2 Patch]({{site.baseurl}}/assets/img/nesaceloader/nespatch-breakdown.png)

Now we can _finally_ begin writing the patch!

This is the original patch I created:

```assembly
.text
// allocate stack frame
stwu r1, -0x20(r1)

// store r3/r4/r5/r6/r7/r8 registers
stw r3, 0x1C(r1)
stw r4, 0x18(r1)
stw r5, 0x14(r1)
stw r6, 0x10(r1)
stw r7, 0x0C(r1)
stw r8, 0x08(r1)

// loader (loads from ROM Data)
lis r3, NES_ROM_DATA_PTR_ADDRESS@h
addi r3, r3, NES_ROM_DATA_PTR_ADDRESS@l
lwz r3, 0(r3)

// check if the ROM start address is nullptr
cmplwi r3, 0
beq exit

// load patch offset
lwz r4, 0(r3) // the first int should be the write pointer
cmplwi r4, 0
beq exit
mr r8, r4 // copy the copy offset to r8 in case we need to jump there
lwz r6, 4(r3) // the second int should be the size to copy (ROM size - 8)
lwz r7, 8(r3) // the third int should be "bool isExecutable". If anything other than 0, the loader will jump to the address it started writing to
addi r5, r3, 0xC

// start patching
patchLoop:
cmpwi r6, 0
ble exit
lbz r3, 0(r5)
stb r3, 0(r4)
addi r4, r4, 1
addi r5, r5, 1
addi r6, r6, -1
b patchLoop

exit:
cmplwi r7, 0
beq cleanup
mflr r0 // copy the current return address as an argument for the executing function to handle
mtlr r8 // store the beginning write address as the return address

cleanup: // restore registers and clear stack frame
lwz r3, 0x1C(r1)
lwz r4, 0x18(r1)
lwz r5, 0x14(r1)
lwz r6, 0x10(r1)
lwz r7, 0x0C(r1)
lwz r8, 0x08(r1)
addi r1, r1, 0x20

// THIS PART CAN BE CHANGED, it's just doing what the instruction it overwrote did
lis r6, 8

// return
blr

// This goes at the "LOADER_ENTRY_POINT_ADDRESS"
bl LOADER_WRITE_ADDRESS - LOADER_ENTRY_POINT_ADDRESS

.data
LOADER_WRITE_ADDRESS = 0x80003970;
LOADER_ENTRY_POINT_ADDRESS = 0x800451C8; // two instructions after call to nesinfo_tag_process2
NES_ROM_DATA_PTR_ADDRESS = 0x801F6C64;
```

Looking at it, there are several problems. The first is that the Gekko CPU in the GameCube has an instruction and data cache. If we don't clear these, any data we overwrite that happens to be cached won't actually be updated. This causes it to usually fail as the game doesn't acknowledge we've changed the code. The second is overall it's just bulky and inefficient.

James Chambers took a look at my code and found that we could overwrite a stored function pointer in `my_malloc` to avoid overwriting code itself. Ultimately I discovered it was better to overwrite the pointer to `my_free` instead, as it is always called when the emulator ends. I also implemented instruction and data cache invalidations for the addresses the loader writes to. Here's the final version of the patch loader:

```assembly
.text
// allocate stack frame
stwu r1, -0x30(r1)

// save LR through r0
mflr r0

// store r0/r3/r4/r5/r6 registers
stw r0, 0x20(r1)
stw r3, 0x1C(r1)
stw r4, 0x18(r1)
stw r5, 0x14(r1)
stw r6, 0x10(r1)

// loader (loads from ROM Data)
lis r3, NES_ROM_DATA_PTR_ADDRESS@h
addi r3, r3, NES_ROM_DATA_PTR_ADDRESS@l
lwz r3, 0(r3)

// check if the ROM start address is nullptr
cmplwi r3, 0
beq exit

// load patch offset
lwz r4, 0(r3)
cmplwi r4, 0
beq exit
stw r4, 0x28(r1) // save jump offset
lwz r6, 0x08(r3) // the third int should be "bool isExecutable". If anything other than 0, the loader will jump to the address it 
stw r6, 0x24(r1)// save executable flag
lwz r6, 0x04(r3) // the second int should be the size to copy (ROM size - 8)
stw r6, 0x2C(r1) // save size for invalidation operation later
addi r5, r3, 0xC

// start patching
patchLoop:
cmpwi r6, 0
ble exitPatchLoop
lbz r3, 0(r5)
stb r3, 0(r4)
addi r4, r4, 1
addi r5, r5, 1
addi r6, r6, -1
b patchLoop

exitPatchLoop:
// invalidate instruction and data caches
lwz r4, 0x2C(r1) // load size
lwz r3, 0x28(r1) // load address
clrlwi. r0, r4, 27
beq align
addi r4, r4, 0x20

align:
addi r4, r4, 0x1F
srwi r4, r4, 5
mtctr r4

invalidationLoop:
icbi r0, r3
dcbi r0, r3
addi r3, r3, 0x20
bdnz invalidationLoop

// sync invalidaitons
flushCache:
sync
isync

// restore register for arguments to my_zelda_free
lwz r3, 0x1C(r1)

// restore the original pointer to my_zelda_free and branch to it
lis r5, MY_ZELDA_FREE@h
ori r5, r5, MY_ZELDA_FREE@l
lis r6, MY_FREE_PTR@h
ori r6, r6, MY_FREE_PTR@l
stw r5, 0x0(r6)
mtctr r5
bctrl

// check if the patch is executable
lwz r4, 0x24(r1)
cmplwi r4, 0
beq restoreLR
// restore offset and jump
lwz r4, 0x28(r1)
lwz r0, 0x20(r1) // set previous function LR in r0
mtlr r4
b cleanup

restoreLR:
// restore LR
lwz r0, 0x20(r1)
mtlr r0

cleanup:
// restore rest of registers and clear stack frame
lwz r4, 0x18(r1)
lwz r5, 0x14(r1)
lwz r6, 0x10(r1)
addi r1, r1, 0x30
blr

.data
MY_ZELDA_FREE = 0x8062D4CC;
MY_FREE_PTR = 0x806D4B9C;
NES_ROM_DATA_PTR_ADDRESS = 0x801F6C64;
```

It's a lot more concise, and works like a charm! Another thing I should mention is that if the patch is marked as executable, r0 will contain the return address of the function who called the patch loader in it. This allows patch creators to return control back to the game by moving it into the LR register!

### Final Thoughts
This knowledge has already been used to do some incredible things. You can check out my video showcasing the first mod I created for it called [Letter2Item](https://youtu.be/BdxN7gP6WIc).

FIX94 also created a homebrew launcher using the exploit, which you can find [here](https://github.com/FIX94/ac-exploit-gc/releases).

You can find my ACNESCreator program which can create NES ROM files or the Patch files [here](https://github.com/Cuyler36/ACNESCreator/releases).

You can also find a command line version created by [James Chambers](https://github.com/jamchamb) [here](https://github.com/jamchamb/ac-nesrom-save-generator).

<iframe width="560" height="315" src="https://www.youtube.com/embed/BdxN7gP6WIc" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>

I'm excited to see what kinds of things people create with these discoveries and programs.