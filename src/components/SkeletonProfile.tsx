// src/components/ProfileSkeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const ProfileSkeleton = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-pulse">
      <div className="space-y-6">
        {/* Skeleton for Profile Information Card */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-4 w-64 rounded-md" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              {/* Email */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-3 w-40 rounded-md" />
              </div>
              {/* Role */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              {/* Phone */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              {/* Department */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              {/* Button */}
              <Skeleton className="h-10 w-32 rounded-md" />
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Skeleton for Change Password Card */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-4 w-64 rounded-md" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Current Password */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              {/* New Password */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-3 w-32 rounded-md" />
              </div>
              {/* Confirm Password */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              {/* Button */}
              <Skeleton className="h-10 w-36 rounded-md" />
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Skeleton for Logout Card */}
        <Card className="border-transparent">
          <CardContent className="pt-6">
            <Skeleton className="h-10 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};